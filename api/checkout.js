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

    const is10x = parcelas === '10x';
    const cobrancaPayload = {
      customer: customerId,
      billingType: is10x ? 'CREDIT_CARD' : 'UNDEFINED',
      value: is10x ? 3121.70 : 2997.11,
      dueDate,
      description: 'Sagrado Homem 2027 — Retiro de Transformação Masculina (26 a 28 de março)',
      externalReference: `SH27-${Date.now()}`,
      ...(is10x && { installmentCount: 10, installmentValue: 312.17 }),
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
