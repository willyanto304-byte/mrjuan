/* =========================================================
   小王的一天 — app.js (Supabase Auth, Reading Quiz & Analytics)
   ========================================================= */

const SUPABASE_URL  = 'https://giuciapsbnspgpojwwrx.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdWNpYXBzYm5zcGdwb2p3d3J4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MjQ2OTcsImV4cCI6MjEwNjUwMDY5N30.5FBH4ZKl6MPfu2irtBIkJeSG7mi3qQqCr1Zh3Smy3_k';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ==================== STATE MANAGEMENT ==================== */
const state = {
  user: null,
  materials: [],
  submissions: [],
  editingId: null,
  previewId: null,
  activeQuiz: null,
  role: 'mahasiswa',
  registering: false,
};

/* ==================== HELPER FUNCTIONS ==================== */
const $  = (s, r=document) => r.querySelector(s); const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

function toast(msg, type = '') {
  const el = $('#toast');   if (!el) return;   el.textContent = msg;   el.className = 'toast show ' + type;   clearTimeout(el._t);   el._t = setTimeout(() => el.className = 'toast ' + type, 3000); }  function show(viewId) {   $$('.view').forEach(v => v.classList.toggle('active', v.id === viewId));
  window.scrollTo({ top: 0 });
}

function openModal(id) { $('#' + id)?.classList.add('open'); }
function closeModal(id) { $('#' + id)?.classList.remove('open'); }

function fmtSize(bytes) {
  if (!bytes) return 'Ukuran tidak diketahui';
  const k = 1024, u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + u[i];
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { 
    day: '2-digit', month: '2-digit', year: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });
}

function isExpired(deadline) {
  if (!deadline) return false;
  return new Date(deadline).getTime() < Date.now();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ==================== AUTHENTICATION ==================== */
function initLogin() {
  const roleToggle = $('#role-toggle');   roleToggle?.addEventListener('click', e => {     const btn = e.target.closest('.role-btn');     if (!btn) return;     state.role = btn.dataset.role;     $$('.role-btn', roleToggle).forEach(b => b.classList.toggle('active', b === btn));
    if (state.role === 'admin' && state.registering) toggleRegister(false);
  });

  $('#register-toggle')?.addEventListener('click', () => toggleRegister(!state.registering));

  $('#login-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const btn = $('#login-submit');
    btn.disabled = true;
    btn.textContent = 'Memproses...';
    
    if (state.registering) {
      handleRegister().finally(() => resetBtn(btn, 'Daftar'));
    } else {
      handleLogin().finally(() => resetBtn(btn, 'Masuk'));
    }
  });

  db.auth.onAuthStateChange((event, session) => {
    if (session) {
      state.user = {
        id: session.user.id,
        email: session.user.email,
        nama: session.user.user_metadata.nama || 'User',
        nim: session.user.user_metadata.nim || '-',
        role: session.user.user_metadata.role || 'mahasiswa'
      };
      routeAfterLogin();
    } else {
      state.user = null;
      show('view-login');
    }
  });
}

function resetBtn(btn, text) {
  btn.disabled = false;
  btn.textContent = text;
}

function toggleRegister(on) {
  state.registering = on;
  $('#register-fields')?.classList.toggle('hidden', !on);
  $('#login-submit').textContent = on ? 'Daftar' : 'Masuk';
  $('#register-toggle').textContent = on ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar';
  
  if ($('#reg-nama')) $('#reg-nama').required = on && state.role === 'mahasiswa';
  if ($('#reg-nim')) $('#reg-nim').required = on && state.role === 'mahasiswa';
}

async function handleLogin() {
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    return toast(
      error.message === 'Invalid login credentials' ? 'Email atau Password salah' : error.message, 
      'error'
    );
  }

  toast('Berhasil masuk!', 'success');
}

async function handleRegister() {
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const nama = $('#reg-nama').value.trim();
  const nim = $('#reg-nim').value.trim();

  const { error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: {
        nama: state.role === 'admin' ? 'Administrator' : nama,
        nim: state.role === 'admin' ? '-' : nim,
        role: state.role
      }
    }
  });

  if (error) return toast(error.message, 'error');
  toast('Akun berhasil dibuat!', 'success');
}

function routeAfterLogin() {
  if (!state.user) return;
  if (state.user.role === 'admin') {
    if ($('#admin-name')) $('#admin-name').textContent = state.user.nama;
    show('view-admin');
    loadAdminDashboard();
  } else {
    if ($('#student-name')) $('#student-name').textContent = `${state.user.nama} · ${state.user.nim}`;
    show('view-student');
    loadStudentCards();
  }
}

async function logout() {
  await db.auth.signOut();
  $('#login-form')?.reset();
  toggleRegister(false);
  toast('Berhasil keluar', 'success');
}

/* ==================== DATA FETCHING & SUPABASE API ==================== */
async function fetchMaterials() {
  const { data, error } = await db
    .from('materials')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { 
    console.error('Fetch Materials Error:', error);
    toast('Gagal mengambil data materi: ' + error.message, 'error'); 
    return []; 
  }
  state.materials = data || [];
  return state.materials;
}

async function fetchSubmissions() {
  const { data, error } = await db
    .from('quiz_submissions')
    .select('*')
    .order('submitted_at', { ascending: false });

  if (error) {
    console.error('Fetch Submissions Error:', error);
    return [];
  }
  state.submissions = data || [];
  return state.submissions;
}

/* ==================== STUDENT UI ==================== */
async function loadStudentCards() {
  const wrap = $('#student-cards');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Memuat latihan…</div>';

  try {
    const list = await fetchMaterials();
    if (!list.length) {
      wrap.innerHTML = '<div class="empty">Belum ada latihan tersedia.</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach((m, i) => wrap.appendChild(buildCard(m, i)));
  } catch (err) {
    console.error(err);
  }
}

function buildCard(m, i) {
  const el = document.createElement('div');
  el.className = 'card';
  const expired = isExpired(m.deadline);
  const thumbStyle = m.gambar_url ? `background-image:url('${m.gambar_url}')` : '';

  el.innerHTML = `
    <div class="card-head">
      <div class="card-thumb" style="${thumbStyle}">${m.gambar_url ? '' : (i + 1)}</div>
      <div>
        <div class="card-title">${escapeHtml(m.judul)}</div>
        <div class="card-tema">Tema: ${escapeHtml(m.tema)}</div>
      </div>
    </div>
    <div class="card-body">${escapeHtml(m.deskripsi || 'Tidak ada deskripsi.')}</div>
    <div class="card-deadline">
      ⏰ Tenggat: ${fmtDate(m.deadline)} ${expired ? '<span class="badge-deadline expired">Selesai/Expired</span>' : ''}
    </div>
    <div class="card-foot">
      <button class="btn btn-primary" ${expired ? 'disabled' : ''}>
        ${expired ? 'Waktu Habis' : 'Mulai Latihan'}
      </button>
    </div>
  `;
  if (!expired) {
    el.querySelector('button').addEventListener('click', () => openPreview(m.id));
  }
  return el;
}

/* ==================== ADMIN DASHBOARD ==================== */
async function loadAdminDashboard() {
  await fetchMaterials();
  await fetchSubmissions();
  
  // Update Analytics
  if ($('#stat-total-quiz')) $('#stat-total-quiz').textContent = state.materials.length;
  if ($('#stat-total-submits')) $('#stat-total-submits').textContent = state.submissions.length;

  if (state.submissions.length > 0) {
    const totalScore = state.submissions.reduce((a, b) => a + (b.score || 0), 0);
    const avgScore = (totalScore / state.submissions.length).toFixed(1);
    if ($('#stat-avg-score')) $('#stat-avg-score').textContent = avgScore;

    const totalCorrect = state.submissions.reduce((a, b) => a + (b.correct_count || 0), 0);
    const totalWrong = state.submissions.reduce((a, b) => a + (b.wrong_count || 0), 0);
    const totalQuestions = totalCorrect + totalWrong;

    if (totalQuestions > 0) {
      const correctPct = Math.round((totalCorrect / totalQuestions) * 100);
      const wrongPct = 100 - correctPct;
      if ($('#stat-accuracy')) $('#stat-accuracy').textContent = `${correctPct}%`;
      if ($('#stat-accuracy-sub')) $('#stat-accuracy-sub').textContent = `${correctPct}% Benar / ${wrongPct}% Salah`;
    }
  } else {
    if ($('#stat-avg-score')) $('#stat-avg-score').textContent = '0';
    if ($('#stat-accuracy')) $('#stat-accuracy').textContent = '0%';
    if ($('#stat-accuracy-sub')) $('#stat-accuracy-sub').textContent = '0% Benar / 0% Salah';
  }

  renderAdminTable();
  renderRecapTable();
}

function renderAdminTable() {
  const tbody = $('#admin-tbody');
  if (!tbody) return;

  if (!state.materials.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Belum ada konten. Klik "+ Tambah Konten Kuis".</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  state.materials.forEach((m, i) => {
    const expired = isExpired(m.deadline);
    let qCount = 0;
    try {
      const qObj = typeof m.questions === 'string' ? JSON.parse(m.questions) : m.questions;
      qCount = Array.isArray(qObj) ? qObj.length : (qObj?.questions?.length || 0);
    } catch(e) {}

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>
        <strong>${escapeHtml(m.judul)}</strong>
        <div class="muted">${escapeHtml(m.tema)}</div>
      </td>
      <td>
        <span class="badge-deadline ${expired ? 'expired' : ''}">
          ${fmtDate(m.deadline)}
        </span>
      </td>
      <td>${qCount} Soal</td>
      <td>${fmtDate(m.created_at)}</td>
      <td>
        <div class="actions">
          <button class="icon-btn" data-act="view" title="Preview">👁</button>
          <button class="icon-btn" data-act="edit" title="Edit">✏️</button>
          <button class="icon-btn danger" data-act="del" title="Hapus">🗑</button>
        </div>
      </td>
    `;
    tr.querySelector('[data-act="view"]').onclick = () => openPreview(m.id);
    tr.querySelector('[data-act="edit"]').onclick = () => openForm(m.id);
    tr.querySelector('[data-act="del"]').onclick  = () => removeMaterial(m.id, m.judul);
    tbody.appendChild(tr);
  });
}

function renderRecapTable() {
  const tbody = $('#recap-tbody');
  if (!tbody) return;

  if (!state.submissions.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Belum ada pengerjaan kuis dari siswa.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  state.submissions.forEach((s, i) => {
    const tr = document.createElement('tr');
    const totalQ = (s.correct_count || 0) + (s.wrong_count || 0);
    const correctPct = totalQ ? Math.round((s.correct_count / totalQ) * 100) : 0;
    const wrongPct = 100 - correctPct;

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>
        <strong>${escapeHtml(s.student_nama || 'Siswa')}</strong>
        <div class="muted">NIM: ${escapeHtml(s.student_nim || '-')}</div>
      </td>
      <td>${escapeHtml(s.quiz_judul || 'Kuis')}</td>
      <td><strong style="color:var(--primary); font-size:16px;">${s.score || 0}</strong> / 100</td>
      <td>
        <span style="color:var(--success); font-weight:700;">${correctPct}% Benar</span> · 
        <span style="color:var(--danger); font-weight:700;">${wrongPct}% Salah</span>
      </td>
      <td>${fmtDate(s.submitted_at)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ==================== FORM & CONTENT MANAGEMENT ==================== */
function openPreview(id) {
  const m = state.materials.find(x => x.id === id);
  if (!m) return;
  state.previewId = id;

  const img = $('#preview-img');
  if (img) img.style.backgroundImage = m.gambar_url ? `url('${m.gambar_url}')` : 'linear-gradient(135deg,#fca5a5,#f87171)';
  
  if ($('#preview-badge')) $('#preview-badge').textContent = m.judul;
  if ($('#preview-title')) $('#preview-title').textContent = m.tema;
  if ($('#preview-desc')) $('#preview-desc').textContent  = m.deskripsi || 'Tidak ada deskripsi.';
  if ($('#preview-deadline')) $('#preview-deadline').textContent = fmtDate(m.deadline);

  const row = $('#preview-file-row');
  if (row) {
    if (m.file_url) {
      row.classList.remove('hidden');
      if ($('#preview-file-name')) $('#preview-file-name').textContent = m.file_name || 'Materi Tambahan';
      if ($('#preview-file-size')) $('#preview-file-size').textContent = fmtSize(m.file_size);
      if ($('#preview-download')) $('#preview-download').href = m.file_url;
    } else {
      row.classList.add('hidden');
    }
  }

  const startBtn = $('#preview-start');
  if (startBtn) {
    if (isExpired(m.deadline)) {
      startBtn.disabled = true;
      startBtn.textContent = 'Deadline Selesai';
    } else {
      startBtn.disabled = false;
      startBtn.textContent = 'Mulai Kerjakan Soal';
    }
  }

  openModal('modal-preview');
}

function openForm(id = null) {
  state.editingId = id;
  const form = $('#content-form');
  if (!form) return;
  form.reset();
  
  if ($('#f-gambar-preview')) {
    $('#f-gambar-preview').classList.add('hidden');
    $('#f-gambar-preview').style.backgroundImage = '';
  }
  if ($('#f-file-name')) $('#f-file-name').textContent = '';

  if (id) {
    const m = state.materials.find(x => x.id === id);
    if (!m) return;

    if ($('#form-title')) $('#form-title').textContent = 'Edit Konten Kuis';
    if ($('#f-judul')) $('#f-judul').value = m.judul || '';
    if ($('#f-tema')) $('#f-tema').value = m.tema || '';
    if ($('#f-deskripsi')) $('#f-deskripsi').value = m.deskripsi || '';
    
    if (m.deadline && $('#f-deadline')) {
      const d = new Date(m.deadline);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      $('#f-deadline').value = d.toISOString().slice(0, 16);
    }

    // Ekstraksi data Teks Bacaan dan Array Soal
    let qData = typeof m.questions === 'string' ? JSON.parse(m.questions) : m.questions;
    if (Array.isArray(qData)) {
      if ($('#f-article-title')) $('#f-article-title').value = '文章一 / TEKS BACAAN';
      if ($('#f-article-content')) $('#f-article-content').value = '';
      if ($('#f-questions')) $('#f-questions').value = JSON.stringify(qData, null, 2);
    } else if (typeof qData === 'object' && qData !== null) {
      if ($('#f-article-title')) $('#f-article-title').value = qData.article_title || '文章一 / TEKS BACAAN';
      if ($('#f-article-content')) $('#f-article-content').value = qData.article_content || '';
      if ($('#f-questions')) $('#f-questions').value = JSON.stringify(qData.questions || [], null, 2);
    }

    if (m.gambar_url && $('#f-gambar-preview')) {
      $('#f-gambar-preview').style.backgroundImage = `url('${m.gambar_url}')`;
      $('#f-gambar-preview').classList.remove('hidden');
    }
    if (m.file_name && $('#f-file-name')) $('#f-file-name').textContent = 'File saat ini: ' + m.file_name;
  } else {
    if ($('#form-title')) $('#form-title').textContent = 'Tambah Konten Kuis';
    if ($('#f-article-title')) $('#f-article-title').value = '文章一 / TEKS BACAAN';
    
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    if ($('#f-deadline')) $('#f-deadline').value = d.toISOString().slice(0, 16);
  }
  openModal('modal-form');
}

function initForm() {
  $('#f-gambar')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast('Ukuran gambar maksimal 5MB', 'error');
    const reader = new FileReader();
    reader.onload = ev => {
      if ($('#f-gambar-preview')) {
        $('#f-gambar-preview').style.backgroundImage = `url('${ev.target.result}')`;
        $('#f-gambar-preview').classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);
  });

  $('#f-file')?.addEventListener('change', e => {
    const f = e.target.files[0];
    if ($('#f-file-name')) $('#f-file-name').textContent = f ? `File dipilih: ${f.name} (${fmtSize(f.size)})` : '';
  });

  $('#content-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#form-submit');
    btn.disabled = true; 
    btn.textContent = 'Menyimpan…';

    try {
      let questionsArray = [];
      try {
        questionsArray = JSON.parse($('#f-questions').value);
        if (!Array.isArray(questionsArray)) {
          throw new Error('Format soal kuis harus berupa Array JSON [ ... ]');
        }
      } catch (err) {
        throw new Error('Format JSON soal tidak valid. Pastikan penulisan JSON sesuai aturan.');
      }

      // Format payload kuis
      const quizPayload = {
        article_title: $('#f-article-title').value.trim() || '文章 / TEKS BACAAN',
        article_content: $('#f-article-content').value.trim(),
        questions: questionsArray
      };

      const payload = { 
        judul: $('#f-judul').value.trim(), 
        tema: $('#f-tema').value.trim(), 
        deskripsi: $('#f-deskripsi').value.trim(),
        deadline: new Date($('#f-deadline').value).toISOString(),
        questions: quizPayload
      };

      // Upload file opsional jika ada
      const gFile = $('#f-gambar').files[0];
      if (gFile) payload.gambar_url = await uploadFile('gambar', gFile);

      const kFile = $('#f-file').files[0];
      if (kFile) {
        payload.file_url = await uploadFile('kuis', kFile);
        payload.file_name = kFile.name;
        payload.file_size = kFile.size;
      }

      // Panggilan Supabase dengan Strict Error Handling
      if (state.editingId) {
        const { error } = await db.from('materials').update(payload).eq('id', state.editingId);
        if (error) throw new Error(error.message);
        toast('Konten berhasil diperbarui', 'success');
      } else {
        const { error } = await db.from('materials').insert(payload);
        if (error) throw new Error(error.message);
        toast('Konten berhasil ditambahkan', 'success');
      }

      closeModal('modal-form');

      // Refresh Dashboard/Cards
      if (state.user && state.user.role === 'admin') {
        await loadAdminDashboard();
      } else {
        await loadStudentCards();
      }
    } catch (err) {
      console.error('Error saat menyimpan materi:', err);
      toast(err.message || 'Gagal menyimpan ke database Supabase', 'error');
    } finally {
      btn.disabled = false; 
      btn.textContent = 'Simpan Konten';
    }
  });
}

async function uploadFile(bucket, file) {
  const ext = file.name.split('.').pop();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await db.storage.from(bucket).upload(path, file, { cacheControl: '3600' });
  if (error) throw error;
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function removeMaterial(id, judul) {
  if (!confirm(`Hapus "${judul}"?`)) return;
  const { error } = await db.from('materials').delete().eq('id', id);
  if (error) {
    console.error('Delete Error:', error);
    return toast('Gagal menghapus: ' + error.message, 'error');
  }
  toast('Konten dihapus', 'success');
  loadAdminDashboard();
}

/* ==================== INTERACTIVE QUIZ ENGINE ==================== */
function startQuiz() {
  const m = state.materials.find(x => x.id === state.previewId);
  if (!m) return;

  let quizData = null;
  try {
    quizData = typeof m.questions === 'string' ? JSON.parse(m.questions) : m.questions;
  } catch(e) {}

  if (!quizData) return toast('Belum ada data kuis yang valid.', 'error');

  let articleTitle = '文章 / TEKS BACAAN';
  let articleContent = 'Tidak ada teks bacaan untuk kuis ini.';
  let questions = [];

  if (Array.isArray(quizData)) {
    questions = quizData;
  } else if (typeof quizData === 'object' && quizData !== null) {
    articleTitle = quizData.article_title || articleTitle;
    articleContent = quizData.article_content || articleContent;
    questions = quizData.questions || [];
  }

  if (!questions.length) return toast('Tidak ada pertanyaan pada kuis ini.', 'error');

  state.activeQuiz = {
    materialId: m.id,
    judul: m.judul,
    questions: questions
  };

  if ($('#quiz-article-tag')) $('#quiz-article-tag').textContent = articleTitle;
  if ($('#quiz-article-content')) $('#quiz-article-content').textContent = articleContent;
  if ($('#quiz-title')) $('#quiz-title').textContent = m.judul;
  if ($('#quiz-subtitle')) $('#quiz-subtitle').textContent = `Tema: ${m.tema}`;

  $('#quiz-active-wrap')?.classList.remove('hidden');
  $('#quiz-result-wrap')?.classList.add('hidden');
  $('#quiz-submit-btn')?.classList.remove('hidden');
  if ($('#quiz-cancel-btn')) $('#quiz-cancel-btn').textContent = 'Batal';

  renderQuizQuestions(questions);
  closeModal('modal-preview');
  openModal('modal-quiz');
}

function renderQuizQuestions(questions) {
  const container = $('#quiz-container');
  if (!container) return;
  container.innerHTML = '';
  
  updateAnsweredCounter(0, questions.length);

  const letters = ['A', 'B', 'C', 'D', 'E'];

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'q-card';
    
    let optsHtml = '';
    (q.options || []).forEach((opt, oIdx) => {
      const letter = letters[oIdx] || (oIdx + 1);
      optsHtml += `
        <label class="q-opt">
          <input type="radio" name="q_${idx}" value="${oIdx}" />
          <span class="q-opt-badge">${letter}</span>
          <span>${escapeHtml(opt)}</span>
        </label>
      `;
    });

    card.innerHTML = `
      <div class="q-title"><span class="q-number">${String(idx + 1).padStart(2, '0')}</span> ${escapeHtml(q.question)}</div>
      <div class="q-options">${optsHtml}</div>
    `;

    card.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const answeredCount = $$('#quiz-container input[type="radio"]:checked').length;
        updateAnsweredCounter(answeredCount, questions.length);
      });
    });

    container.appendChild(card);
  });
}

function updateAnsweredCounter(answered, total) {
  if ($('#quiz-answered-count')) $('#quiz-answered-count').textContent = `${answered} / ${total} dijawab`;
}

async function submitQuizAnswers() {
  const qList = state.activeQuiz?.questions || [];
  let correct = 0;
  let wrong = 0;

  for (let i = 0; i < qList.length; i++) {
    const selected = $(`input[name="q_${i}"]:checked`);
    if (!selected) return toast(`Harap jawab pertanyaan no. ${i + 1}`, 'error');
    
    if (parseInt(selected.value) === qList[i].answer) {
      correct++;
    } else {
      wrong++;
    }
  }

  const score = Math.round((correct / qList.length) * 100);
  const correctPct = Math.round((correct / qList.length) * 100);
  const wrongPct = 100 - correctPct;

  // Simpan hasil pengerjaan kuis ke Supabase
  const payload = {
    user_id: state.user?.id || null,
    student_nama: state.user?.nama || 'Siswa',
    student_nim: state.user?.nim || '-',
    material_id: state.activeQuiz.materialId,
    quiz_judul: state.activeQuiz.judul,
    score: score,
    correct_count: correct,
    wrong_count: wrong,
    submitted_at: new Date().toISOString()
  };

  const { error } = await db.from('quiz_submissions').insert(payload);
  if (error) {
    console.error('Submit Quiz Error:', error);
    toast('Kuis selesai, namun rekap nilai gagal disimpan: ' + error.message, 'error');
  } else {
    toast('Kuis berhasil dikirim! 🎉', 'success');
  }

  // Tampilkan Ringkasan Hasil
  $('#quiz-active-wrap')?.classList.add('hidden');
  $('#quiz-result-wrap')?.classList.remove('hidden');
  $('#quiz-submit-btn')?.classList.add('hidden');
  if ($('#quiz-cancel-btn')) $('#quiz-cancel-btn').textContent = 'Tutup Hasil';

  if ($('#result-score-circle')) $('#result-score-circle').textContent = score;
  if ($('#res-correct-count')) $('#res-correct-count').textContent = correct;
  if ($('#res-correct-pct')) $('#res-correct-pct').textContent = `(${correctPct}%)`;
  if ($('#res-wrong-count')) $('#res-wrong-count').textContent = wrong;
  if ($('#res-wrong-pct')) $('#res-wrong-pct').textContent = `(${wrongPct}%)`;
}

/* ==================== INITIALIZATION ==================== */
function initModals() {
  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => btn.closest('.modal')?.classList.remove('open')));
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); })); }  function initAdminTabs() {   $$
('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));$$
('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $('#' + btn.dataset.tab)?.classList.add('active');
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  initForm();
  initModals();
  initAdminTabs();

  $('#add-content-btn')?.addEventListener('click', () => openForm(null));
  $('#preview-start')?.addEventListener('click', startQuiz);
  $('#quiz-submit-btn')?.addEventListener('click', submitQuizAnswers);
  $('#logout-btn')?.addEventListener('click', logout);
  $('#logout-btn-2')?.addEventListener('click', logout);
});