export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nome, email, cpf, telefone, parcelas } = req.body || {};

  if (!nome || !email || !cpf) {
    return res.status(400).json({ error: 'Nome, e-mail e CPF são obrigatórios.' });
  }

  const ASAAS_KEY = process.env.ASAAS_API_KEY;
  if (!ASAAS_KEY) {
    return res.status(500).json({ error: 'Configuração interna ausente.' });
  }

  const ASAAS_URL = 'https://api.asaas.com/v3';
  const headers = {
    'Content-Type': 'application/json',
    'access_token': ASAAS_KEY,
  };

  try {
    // 1. Criar ou buscar cliente no Asaas pelo CPF/CNPJ
    const cpfLimpo = cpf.replace(/\D/g, '');
    const busca = await fetch(`${ASAAS_URL}/customers?cpfCnpj=${cpfLimpo}`, { headers });
    const buscaData = await busca.json();

    let customerId;
    if (buscaData.data && buscaData.data.length > 0) {
      customerId = buscaData.data[0].id;
    } else {
      const clientePayload = { name: nome, email, cpfCnpj: cpfLimpo };
      if (telefone) clientePayload.mobilePhone = telefone.replace(/\D/g, '');

      const criarCliente = await fetch(`${ASAAS_URL}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify(clientePayload),
      });
      const clienteData = await criarCliente.json();
      if (!clienteData.id) {
        return res.status(400).json({ error: clienteData.errors?.[0]?.description || 'Erro ao criar cliente.' });
      }
      customerId = clienteData.id;
    }

    // 2. Criar cobrança (cliente escolhe forma de pagamento na página do Asaas)
    const hoje = new Date();
    const vencimento = new Date(hoje);
    vencimento.setDate(hoje.getDate() + 3); // 3 dias para pagar
    const dueDate = vencimento.toISOString().split('T')[0];

    // Tabela: parcelas → [installmentValue, total] — mesmos valores para cartão e boleto
    const PARCELAS = {
      avista:       { n: 0,  valor: 2997.11, total: 2997.11, tipo: 'UNDEFINED'     },
      '2x':         { n: 2,  valor: 1552.49, total: 3104.98, tipo: 'CREDIT_CARD'   },
      '3x':         { n: 3,  valor: 1034.99, total: 3104.97, tipo: 'CREDIT_CARD'   },
      '4x':         { n: 4,  valor:  776.24, total: 3104.96, tipo: 'CREDIT_CARD'   },
      '5x':         { n: 5,  valor:  620.99, total: 3104.95, tipo: 'CREDIT_CARD'   },
      '6x':         { n: 6,  valor:  517.50, total: 3105.00, tipo: 'CREDIT_CARD'   },
      '7x':         { n: 7,  valor:  445.96, total: 3121.72, tipo: 'CREDIT_CARD'   },
      '8x':         { n: 8,  valor:  390.21, total: 3121.68, tipo: 'CREDIT_CARD'   },
      '9x':         { n: 9,  valor:  346.86, total: 3121.74, tipo: 'CREDIT_CARD'   },
      '10x':        { n: 10, valor:  312.17, total: 3121.70, tipo: 'CREDIT_CARD'   },
      'boleto-2x':  { n: 2,  valor: 1552.49, total: 3104.98, tipo: 'BOLETO'        },
      'boleto-3x':  { n: 3,  valor: 1034.99, total: 3104.97, tipo: 'BOLETO'        },
      'boleto-4x':  { n: 4,  valor:  776.24, total: 3104.96, tipo: 'BOLETO'        },
      'boleto-5x':  { n: 5,  valor:  620.99, total: 3104.95, tipo: 'BOLETO'        },
      'boleto-6x':  { n: 6,  valor:  517.50, total: 3105.00, tipo: 'BOLETO'        },
      'boleto-7x':  { n: 7,  valor:  445.96, total: 3121.72, tipo: 'BOLETO'        },
      'boleto-8x':  { n: 8,  valor:  390.21, total: 3121.68, tipo: 'BOLETO'        },
      'boleto-9x':  { n: 9,  valor:  346.86, total: 3121.74, tipo: 'BOLETO'        },
      'boleto-10x': { n: 10, valor:  312.17, total: 3121.70, tipo: 'BOLETO'        },
    };
    const opcao = PARCELAS[parcelas] || PARCELAS['avista'];
    const isParcelado = opcao.n > 0;
    const cobrancaPayload = {
      customer: customerId,
      billingType: opcao.tipo,
      value: opcao.total,
      dueDate,
      description: 'Sagrado Homem 2027 — Retiro de Transformação Masculina (26 a 28 de março)',
      externalReference: `SH27-${Date.now()}`,
      ...(isParcelado && { installmentCount: opcao.n, installmentValue: opcao.valor }),
    };

    const criarCobranca = await fetch(`${ASAAS_URL}/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(cobrancaPayload),
    });
    const cobrancaData = await criarCobranca.json();

    if (!cobrancaData.invoiceUrl) {
      return res.status(400).json({ error: cobrancaData.errors?.[0]?.description || 'Erro ao gerar cobrança.' });
    }

    return res.status(200).json({ url: cobrancaData.invoiceUrl });
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}
