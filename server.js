const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== CONFIGURAÇÕES ====================
const REMOTE_BASE = 'https://network-class.onrender.com'; // servidor remoto
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL = 'openai/gpt-oss-120b:free'; // modelo gratuito

// ==================== FUNÇÃO AUXILIAR PARA PROXY ====================
async function proxyRequest(req, res, endpoint, method = req.method) {
  const url = `${REMOTE_BASE}${endpoint}`;
  
  // Prepara os headers, removendo os que podem causar conflito
  const headers = {
    ...req.headers,
    host: new URL(REMOTE_BASE).host,
  };
  delete headers['content-length'];
  delete headers['connection'];

  const options = {
    method,
    headers,
  };

  // Se houver corpo, adiciona ao fetch
  if (method !== 'GET' && method !== 'HEAD' && req.body) {
    options.body = JSON.stringify(req.body);
    // Garante que o content-type seja application/json
    if (!headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
  }

  try {
    const response = await fetch(url, options);
    
    // Tenta obter o corpo da resposta (pode ser JSON ou texto)
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Repassa o status code e os dados
    res.status(response.status).send(data);
  } catch (error) {
    console.error(`Erro no proxy para ${endpoint}:`, error.message);
    res.status(500).json({ error: 'Erro ao comunicar com servidor remoto', details: error.message });
  }
}

// ==================== ROTAS PROXY ====================
app.post('/registration/edusp', (req, res) => proxyRequest(req, res, '/registration/edusp', 'POST'));
app.get('/room/user', (req, res) => proxyRequest(req, res, '/room/user', 'GET'));
app.get('/tms/task/todo', (req, res) => proxyRequest(req, res, '/tms/task/todo', 'GET'));
app.get('/tms/task/:id/apply', (req, res) => {
  const endpoint = `/tms/task/${req.params.id}/apply${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`;
  proxyRequest(req, res, endpoint, 'GET');
});
app.post('/complete', (req, res) => proxyRequest(req, res, '/complete', 'POST'));

// ==================== ROTA DE GERAÇÃO COM IA (OPENROUTER) ====================
app.post('/generate_essay', async (req, res) => {
  const { genre, prompt } = req.body;

  const userMessage = `Você é um assistente especializado em escrever redações escolares. 
Gênero: ${genre}. 
Baseie-se no seguinte enunciado e textos de apoio para produzir uma redação completa, com título e desenvolvimento. 
Formate a resposta exatamente assim:

TITULO: (título da redação)
TEXTO: (texto completo da redação, com parágrafos)

Segue o conteúdo:
${prompt}`;

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://network-class.onrender.com',
        'X-Title': 'Network Redação'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: userMessage }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Erro na OpenRouter');
    }

    const iaResponse = data.choices[0].message.content;
    res.json({ success: true, response: iaResponse });
  } catch (error) {
    console.error('Erro ao chamar OpenRouter:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor proxy rodando em http://localhost:${PORT}`);
});
