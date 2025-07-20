'use strict';

// WEBHOOK GOOGLE PLANILHAS - substitua pelo seu link de webhook já configurado
const GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwgDdr7l0x31MPaC-KvLnvU7WgZB11bEuCEpeqHrgRJRSxTUdUWKJh7lsr-WWMMJXme/exec';

// --- DADOS LOCAIS ---
let users = [];
let materials = [];
let requests = [];

let currentUser = null;

// Utilitário para salvar no localStorage
function saveData() {
  localStorage.setItem('users', JSON.stringify(users));
  localStorage.setItem('materials', JSON.stringify(materials));
  localStorage.setItem('requests', JSON.stringify(requests));
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
}

// Utilitário para carregar do localStorage
function loadData() {
  users = JSON.parse(localStorage.getItem('users')) || [];
  materials = JSON.parse(localStorage.getItem('materials')) || [];
  requests = JSON.parse(localStorage.getItem('requests')) || [];
  currentUser = JSON.parse(localStorage.getItem('currentUser'));
}

// --- Inicialização padrão: cria um admin se não existir ---
function ensureDefaultAdmin() {
  if (!users.find(u => u.perfil === 'admin')) {
    users.push({
      id: 'admin-1',
      nome: 'Administrador',
      login: 'admin',
      senha: 'admin123',
      perfil: 'admin',
      foto: '',
      online: false
    });
    saveData();
  }
}

// --- Login e logout ---
function login(username, password) {
  const user = users.find(u => u.login === username && u.senha === password);
  if (user) {
    user.online = true;
    currentUser = user;
    saveData();
    return true;
  }
  return false;
}

function logout() {
  if (currentUser) {
    const u = users.find(u => u.id === currentUser.id);
    if (u) u.online = false;
  }
  currentUser = null;
  saveData();
}

// --- UI Helper ---
function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return document.querySelectorAll(selector);
}

function showError(msg, el) {
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

function clearForm(form) {
  form.reset();
}

// --- Render Login Screen ---
function renderLogin() {
  qs('#login-screen').classList.remove('hidden');
  qs('#app-screen').classList.add('hidden');
  qs('#login-error').textContent = '';
  qs('#login-username').value = '';
  qs('#login-password').value = '';
  qs('#login-username').focus();
}

// --- Render App Screen ---
function renderApp() {
  qs('#login-screen').classList.add('hidden');
  qs('#app-screen').classList.remove('hidden');

  // Atualiza dados do perfil
  qs('#profile-name').textContent = currentUser.nome;
  qs('#profile-status').className = currentUser.online ? 'status-dot online' : 'status-dot offline';

  if (currentUser.foto) {
    qs('#profile-pic').style.backgroundImage = `url(${currentUser.foto})`;
  } else {
    qs('#profile-pic').style.backgroundImage = `url('https://cdn-icons-png.flaticon.com/512/847/847969.png')`; // ícone genérico
  }

  // Mostra abas admin apenas para admin
  if (currentUser.perfil === 'admin') {
    qsa('.admin-only').forEach(el => el.style.display = 'inline-block');
  } else {
    qsa('.admin-only').forEach(el => el.style.display = 'none');
  }

  loadMaterialsIntoSelect();
  renderHistorico();
  renderMateriaisTable();
  renderAprovacoesTable();
  renderUsuariosTable();

  // Ajusta abas para a inicial
  setActiveTab('solicitacao-tab');
}

// --- Navegação das abas ---
function setActiveTab(tabId) {
  qsa('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  qsa('.tab-content').forEach(sec => {
    sec.classList.toggle('active', sec.id === tabId);
  });
}

// --- Carregar materiais no select de solicitação ---
function loadMaterialsIntoSelect() {
  const select = qs('#material-select');
  select.innerHTML = '';
  if (materials.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhum material cadastrado';
    select.appendChild(opt);
    select.disabled = true;
  } else {
    select.disabled = false;
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- Selecione --';
    defaultOpt.selected = true;
    defaultOpt.disabled = true;
    select.appendChild(defaultOpt);

    materials.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.nome} (Estoque: ${m.quantidade})`;
      select.appendChild(opt);
    });
  }
}

// --- Render histórico para técnico ---
function renderHistorico() {
  const tbody = qs('#historico-table tbody');
  tbody.innerHTML = '';
  const userRequests = requests.filter(r => r.solicitanteId === currentUser.id);
  userRequests.sort((a,b) => new Date(b.data) - new Date(a.data));
  userRequests.forEach(r => {
    const material = materials.find(m => m.id === r.materialId);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.data).toLocaleString()}</td>
      <td>${material ? material.nome : 'Material removido'}</td>
      <td>${r.quantidade}</td>
      <td>${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</td>
      <td>
        ${r.status === 'aprovado' ? `<button class="action-btn" data-id="${r.id}" onclick="gerarComprovantePDF('${r.id}')">Comprovante</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Render materiais tabela admin ---
function renderMateriaisTable() {
  const tbody = qs('#materiais-table tbody');
  tbody.innerHTML = '';
  materials.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.nome}</td>
      <td>${m.quantidade}</td>
      <td>
        <button class="action-btn" onclick="editarMaterial('${m.id}')">Editar</button>
        <button class="action-btn" onclick="excluirMaterial('${m.id}')">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Render aprovações tabela admin ---
function renderAprovacoesTable() {
  const tbody = qs('#aprovacoes-table tbody');
  tbody.innerHTML = '';
  // Apenas solicitações pendentes
  const pendentes = requests.filter(r => r.status === 'pendente');
  pendentes.sort((a,b) => new Date(b.data) - new Date(a.data));
  pendentes.forEach(r => {
    const material = materials.find(m => m.id === r.materialId);
    const solicitante = users.find(u => u.id === r.solicitanteId);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.data).toLocaleString()}</td>
      <td>${solicitante ? solicitante.nome : 'Usuário removido'}</td>
      <td>${material ? material.nome : 'Material removido'}</td>
      <td>${r.quantidade}</td>
      <td>${r.foto ? `<img src="${r.foto}" alt="Foto" class="solicitacao-foto" />` : '—'}</td>
      <td>${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</td>
      <td>
        <button class="action-btn" onclick="aprovarSolicitacao('${r.id}')">Aprovar</button>
        <button class="action-btn" onclick="recusarSolicitacao('${r.id}')">Recusar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Render usuários tabela admin ---
function renderUsuariosTable() {
  const tbody = qs('#usuarios-table tbody');
  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.nome}</td>
      <td>${u.login}</td>
      <td>${u.perfil.charAt(0).toUpperCase() + u.perfil.slice(1)}</td>
      <td>
        <button class="action-btn" onclick="editarUsuario('${u.id}')">Editar</button>
        <button class="action-btn" onclick="excluirUsuario('${u.id}')">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Eventos e lógica ---

// Login form
qs('#login-form').addEventListener('submit', e => {
  e.preventDefault();
  const loginInput = qs('#login-username').value.trim();
  const senhaInput = qs('#login-password').value.trim();
  const erroEl = qs('#login-error');
  if (login(loginInput, senhaInput)) {
    renderApp();
  } else {
    erroEl.textContent = 'Login ou senha incorretos.';
  }
});

// Logout
qs('#logout-btn').addEventListener('click', () => {
  logout();
  renderLogin();
});

// Aba navegação
qsa('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
  });
});

// Solicitação de material
qs('#solicitacao-form').addEventListener('submit', e => {
  e.preventDefault();
  const materialId = qs('#material-select').value;
  const quantidade = parseInt(qs('#quantidade-input').value);
  const fotoInput = qs('#foto-anexo');

  if (!materialId) return alert('Selecione um material.');
  if (!quantidade || quantidade < 1) return alert('Quantidade inválida.');

  let fotoDataUrl = null;

  if (fotoInput.files && fotoInput.files[0]) {
    const reader = new FileReader();
    reader.onload = function(ev) {
      fotoDataUrl = ev.target.result;
      salvarSolicitacao(materialId, quantidade, fotoDataUrl);
    };
    reader.readAsDataURL(fotoInput.files[0]);
  } else {
    salvarSolicitacao(materialId, quantidade, null);
  }
});

function salvarSolicitacao(materialId, quantidade, foto) {
  const id = 'req-' + Date.now();
  const novaReq = {
    id,
    solicitanteId: currentUser.id,
    materialId,
    quantidade,
    foto,
    status: 'pendente',
    data: new Date().toISOString()
  };
  requests.push(novaReq);
  saveData();
  qs('#solicitacao-msg').textContent = 'Solicitação enviada! Aguarde aprovação.';
  clearForm(qs('#solicitacao-form'));
  renderHistorico();
  loadMaterialsIntoSelect();
  setTimeout(() => {
    qs('#solicitacao-msg').textContent = '';
  }, 5000);
}

// Cadastro de materiais (admin)
qs('#material-form').addEventListener('submit', e => {
  e.preventDefault();
  const id = qs('#material-id').value;
  const nome = qs('#material-nome').value.trim();
  const quantidade = parseInt(qs('#material-quantidade').value);

  if (!nome) return alert('Informe o nome do material.');
  if (quantidade < 0) return alert('Quantidade inválida.');

  if (id) {
    // editar
    const mat = materials.find(m => m.id === id);
    if (mat) {
      mat.nome = nome;
      mat.quantidade = quantidade;
    }
  } else {
    // novo
    materials.push({id: 'mat-'+Date.now(), nome, quantidade});
  }

  saveData();
  clearForm(qs('#material-form'));
  qs('#material-cancel-btn').classList.add('hidden');
  renderMateriaisTable();
  loadMaterialsIntoSelect();
});

// Cancelar edição material
qs('#material-cancel-btn').addEventListener('click', () => {
  clearForm(qs('#material-form'));
  qs('#material-id').value = '';
  qs('#material-cancel-btn').classList.add('hidden');
});

// Editar material
window.editarMaterial = function(id) {
  const mat = materials.find(m => m.id === id);
  if (!mat) return;
  qs('#material-id').value = mat.id;
  qs('#material-nome').value = mat.nome;
  qs('#material-quantidade').value = mat.quantidade;
  qs('#material-cancel-btn').classList.remove('hidden');
  setActiveTab('materiais-tab');
};

// Excluir material
window.excluirMaterial = function(id) {
  if (!confirm('Excluir este material? Esta ação não pode ser desfeita.')) return;
  materials = materials.filter(m => m.id !== id);
  saveData();
  renderMateriaisTable();
  loadMaterialsIntoSelect();
};

// Aprovar solicitação
window.aprovarSolicitacao = function(id) {
  const req = requests.find(r => r.id === id);
  if (!req) return;
  // Atualiza status e reduz estoque
  const mat = materials.find(m => m.id === req.materialId);
  if (!mat) return alert('Material não encontrado.');
  if (mat.quantidade < req.quantidade) {
    alert(`Estoque insuficiente! Estoque atual: ${mat.quantidade}`);
    return;
  }
  mat.quantidade -= req.quantidade;
  req.status = 'aprovado';
  saveData();
  renderAprovacoesTable();
  renderMateriaisTable();
  loadMaterialsIntoSelect();
  enviarDadosParaPlanilha(req);
  renderHistorico();
  alert('Solicitação aprovada!');

  // Opcional: gerar comprovante PDF e mostrar botão para enviar WhatsApp
  gerarComprovantePDF(id, true);
};

// Recusar solicitação
window.recusarSolicitacao = function(id) {
  const req = requests.find(r => r.id === id);
  if (!req) return;
  req.status = 'recusado';
  saveData();
  renderAprovacoesTable();
  renderHistorico();
  alert('Solicitação recusada.');
};

// --- Geração PDF comprovante ---
window.gerarComprovantePDF = function(id, autoShow=false) {
  const req = requests.find(r => r.id === id);
  if (!req) return alert('Solicitação não encontrada.');
  const mat = materials.find(m => m.id === req.materialId);
  const solicitante = users.find(u => u.id === req.solicitanteId);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor('#ff0000');
  doc.text('CONSTRUCABLE', 105, 20, { align: 'center' });

  doc.setFontSize(14);
  doc.setTextColor('#000');
  doc.text(`Comprovante de Solicitação`, 105, 30, { align: 'center' });

  doc.setFontSize(12);
  doc.text(`Solicitante: ${solicitante ? solicitante.nome : 'Desconhecido'}`, 20, 50);
  doc.text(`Material: ${mat ? mat.nome : 'Removido'}`, 20, 60);
  doc.text(`Quantidade: ${req.quantidade}`, 20, 70);
  doc.text(`Data: ${new Date(req.data).toLocaleString()}`, 20, 80);
  doc.text(`Status: ${req.status.charAt(0).toUpperCase() + req.status.slice(1)}`, 20, 90);

  if (req.foto) {
    // Imagem da foto opcional (redimensionada)
    doc.text('Foto anexada:', 20, 100);
    doc.addImage(req.foto, 'JPEG', 20, 105, 60, 40);
  }

  doc.setTextColor('#ff0000');
  doc.text('Obrigado pela preferência!', 105, 160, { align: 'center' });

  if (autoShow) {
    doc.save(`comprovante_${id}.pdf`);
  } else {
    doc.save(`comprovante_${id}.pdf`);
  }
};

// --- Envio para Google Planilhas via webhook ---
function enviarDadosParaPlanilha(req) {
  const mat = materials.find(m => m.id === req.materialId);
  const solicitante = users.find(u => u.id === req.solicitanteId);

  // Dados para enviar
  const dataToSend = {
    id: req.id,
    data: req.data,
    solicitante: solicitante ? solicitante.nome : 'Desconhecido',
    loginSolicitante: solicitante ? solicitante.login : '',
    material: mat ? mat.nome : '',
    quantidade: req.quantidade,
    status: req.status,
    foto: req.foto || ''
  };

  fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
    method: 'POST',
    mode: 'no-cors', // para não bloquear
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dataToSend)
  }).catch(err => {
    // Não dá erro visível ao usuário, mas você pode registrar
    console.warn('Erro ao enviar dados para Google Sheets:', err);
  });
}

// --- Gerenciamento usuários (Admin) ---
qs('#usuario-form').addEventListener('submit', e => {
  e.preventDefault();
  const id = qs('#usuario-id').value;
  const nome = qs('#usuario-nome').value.trim();
  const loginU = qs('#usuario-login').value.trim();
  const senha = qs('#usuario-senha').value.trim();
  const perfil = qs('#usuario-perfil').value;

  if (!nome || !loginU || !senha || !perfil) return alert('Preencha todos os campos');

  // Checar login duplicado (exceto edição)
  if (users.some(u => u.login === loginU && u.id !== id)) {
    return alert('Login já existente!');
  }

  if (id) {
    // editar
    const user = users.find(u => u.id === id);
    if (user) {
      user.nome = nome;
      user.login = loginU;
      user.senha = senha;
      user.perfil = perfil;
    }
  } else {
    // novo
    users.push({
      id: 'usr-' + Date.now(),
      nome,
      login: loginU,
      senha,
      perfil,
      foto: '',
      online: false
    });
  }

  saveData();
  clearForm(qs('#usuario-form'));
  qs('#usuario-cancel-btn').classList.add('hidden');
  renderUsuariosTable();
});

// Cancelar edição usuário
qs('#usuario-cancel-btn').addEventListener('click', () => {
  clearForm(qs('#usuario-form'));
  qs('#usuario-id').value = '';
  qs('#usuario-cancel-btn').classList.add('hidden');
});

// Editar usuário
window.editarUsuario = function(id) {
  const user = users.find(u => u.id === id);
  if (!user) return;
  qs('#usuario-id').value = user.id;
  qs('#usuario-nome').value = user.nome;
  qs('#usuario-login').value = user.login;
  qs('#usuario-senha').value = user.senha;
  qs('#usuario-perfil').value = user.perfil;
  qs('#usuario-cancel-btn').classList.remove('hidden');
  setActiveTab('usuarios-tab');
};

// Excluir usuário
window.excluirUsuario = function(id) {
  if (!confirm('Excluir este usuário?')) return;
  users = users.filter(u => u.id !== id);
  saveData();
  renderUsuariosTable();
};

// --- Inicialização ---
function init() {
  loadData();
  ensureDefaultAdmin();

  if (currentUser) {
    // Marca como online
    const u = users.find(u => u.id === currentUser.id);
    if (u) {
      u.online = true;
      currentUser = u;
      saveData();
    }
    renderApp();
  } else {
    renderLogin();
  }
}

// --- Inicializa ---
window.onload = init;
