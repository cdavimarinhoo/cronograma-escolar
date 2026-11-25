
/*
  CONFIGURAÇÃO DO SUPABASE
  Substitua os dois valores abaixo pelos dados do seu projeto.
*/

const SUPABASE_URL = "SUA_URL_DO_SUPABASE";
const SUPABASE_ANON_KEY = "SUA_CHAVE_PUBLICA_ANON";

const configured =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_ANON_KEY !== "SUA_CHAVE_PUBLICA_ANON";

const db = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let currentUser = null;
let authMode = "login";
let schedules = [];
let tasks = [];

const $ = (id) => document.getElementById(id);

function message(element, text, error = false) {
  element.textContent = text;
  element.style.color = error ? "#d34c60" : "#39865a";
}

function setLoading(button, loading, normalText) {
  button.disabled = loading;
  button.textContent = loading ? "Aguarde..." : normalText;
}

function showApp(show) {
  $("auth").classList.toggle("hidden", show);
  $("app").classList.toggle("hidden", !show);
}

function escapeText(value) {
  return String(value ?? "");
}

// Alternância entre login e cadastro
function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";

  $("loginTab").classList.toggle("active", !registering);
  $("registerTab").classList.toggle("active", registering);
  $("nameField").classList.toggle("hidden", !registering);
  $("studentName").required = registering;

  $("authSubmit").textContent = registering
    ? "Criar minha conta"
    : "Entrar na plataforma";

  $("authMessage").textContent = "";
}

$("loginTab").addEventListener("click", () => setAuthMode("login"));
$("registerTab").addEventListener("click", () => setAuthMode("register"));

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!db) {
    message($("authMessage"), "Configure a URL e a chave do Supabase primeiro.", true);
    return;
  }

  const email = $("email").value.trim();
  const password = $("password").value;
  const name = $("studentName").value.trim();
  const button = $("authSubmit");

  if (authMode === "register" && !name) {
    message($("authMessage"), "Digite seu nome completo.", true);
    return;
  }

  setLoading(button, true, authMode === "register"
    ? "Criar minha conta"
    : "Entrar na plataforma");

  try {
    if (authMode === "register") {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name }
        }
      });

      if (error) throw error;

      if (!data.session) {
        message(
          $("authMessage"),
          "Cadastro realizado! Confira seu e-mail para confirmar a conta."
        );
      } else {
        message($("authMessage"), "Conta criada com sucesso!");
      }
    } else {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
    }
  } catch (error) {
    message($("authMessage"), error.message, true);
  } finally {
    setLoading(button, false, authMode === "register"
      ? "Criar minha conta"
      : "Entrar na plataforma");
  }
});

// Entrada e saída da plataforma
async function startApp(user) {
  currentUser = user;

  const name =
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Estudante";

  $("welcomeName").textContent = name;
  $("avatar").textContent = name.charAt(0).toUpperCase();

  showApp(true);
  await loadData();
}

$("logoutBtn").addEventListener("click", async () => {
  if (!db) return;

  const { error } = await db.auth.signOut();
  if (error) alert(error.message);
});

// CARREGAR DADOS
async function loadData() {
  if (!currentUser) return;

  const [scheduleResult, taskResult] = await Promise.all([
    db.from("study_schedule")
      .select("*")
      .order("study_time"),
    db.from("study_tasks")
      .select("*")
      .order("due_date")
  ]);

  if (scheduleResult.error || taskResult.error) {
    console.error(scheduleResult.error, taskResult.error);
    alert("Não foi possível carregar seus dados. Verifique a configuração do banco.");
    return;
  }

  schedules = scheduleResult.data || [];
  tasks = taskResult.data || [];

  renderSchedules();
  renderTasks();
  updateProgress();
}

// CRONOGRAMA
$("scheduleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;

  const subject = $("subject").value.trim();
  const day = $("scheduleDay").value;
  const time = $("scheduleTime").value;

  if (!subject || !day || !time) return;

  const { error } = await db.from("study_schedule").insert({
    user_id: currentUser.id,
    subject,
    day,
    study_time: time
  });

  if (error) {
    alert("Erro ao adicionar horário: " + error.message);
    return;
  }

  $("scheduleForm").reset();
  await loadData();
});

function renderSchedules() {
  const container = $("scheduleList");
  container.replaceChildren();

  const days = [
    "Segunda-feira", "Terça-feira", "Quarta-feira",
    "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"
  ];

  if (!schedules.length) {
    container.innerHTML = '<p class="empty">Seu cronograma aparecerá aqui.</p>';
    return;
  }

  days.forEach(day => {
    const dayItems = schedules.filter(item => item.day === day);
    if (!dayItems.length) return;

    const heading = document.createElement("h3");
    heading.textContent = day;
    heading.style.cssText = "font-size:13px;margin:15px 0 5px;color:#6555bd";
    container.appendChild(heading);

    dayItems.forEach(item => {
      const row = document.createElement("div");
      row.className = "schedule-item";

      const info = document.createElement("div");
      info.className = "item-info";

      const title = document.createElement("strong");
      title.textContent = item.subject;

      const time = document.createElement("small");
      time.textContent = "Horário: " + item.study_time.slice(0, 5);

      info.append(title, time);

      const remove = document.createElement("button");
      remove.className = "delete-btn";
      remove.textContent = "Excluir";
      remove.addEventListener("click", () => deleteItem("study_schedule", item.id));

      row.append(info, remove);
      container.appendChild(row);
    });
  });
}

// TAREFAS
$("taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;

  const title = $("taskTitle").value.trim();
  const date = $("taskDate").value;

  if (!title || !date) return;

  const { error } = await db.from("study_tasks").insert({
    user_id: currentUser.id,
    title,
    due_date: date,
    completed: false
  });

  if (error) {
    alert("Erro ao adicionar tarefa: " + error.message);
    return;
  }

  $("taskForm").reset();
  await loadData();
});

function renderTasks() {
  const container = $("taskList");
  container.replaceChildren();

  if (!tasks.length) {
    container.innerHTML = '<p class="empty">Você ainda não possui tarefas.</p>';
    return;
  }

  tasks.forEach(task => {
    const row = document.createElement("div");
    row.className = "task-item";

    const info = document.createElement("div");
    info.className = "item-info";

    const title = document.createElement("strong");
    title.textContent = task.title;
    if (task.completed) title.classList.add("done");

    const date = document.createElement("small");
    const [year, month, day] = task.due_date.split("-");
    date.textContent = `Entrega: ${day}/${month}/${year}`;

    info.append(title, date);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "done-check";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", "Marcar tarefa como concluída");
    checkbox.addEventListener("change", () =>
      toggleTask(task.id, checkbox.checked)
    );

    const remove = document.createElement("button");
    remove.className = "delete-btn";
    remove.textContent = "Excluir";
    remove.addEventListener("click", () => deleteItem("study_tasks", task.id));

    actions.append(checkbox, remove);
    row.append(info, actions);
    container.appendChild(row);
  });
}

async function toggleTask(id, completed) {
  const { error } = await db.from("study_tasks")
    .update({ completed })
    .eq("id", id);

  if (error) {
    alert("Não foi possível atualizar a tarefa.");
    return;
  }

  await loadData();
}

async function deleteItem(table, id) {
  if (!confirm("Deseja excluir este item?")) return;

  const { error } = await db.from(table)
    .delete()
    .eq("id", id);

  if (error) {
    alert("Não foi possível excluir: " + error.message);
    return;
  }

  await loadData();
}

// PROGRESSO
function updateProgress() {
  const total = tasks.length;
  const completed = tasks.filter(task => task.completed).length;
  const percentage = total ? Math.round(completed / total * 100) : 0;

  $("totalTasks").textContent = total;
  $("completedTasks").textContent = completed;
  $("progressNumber").textContent = percentage + "%";
  $("progressBar").style.width = percentage + "%";
  $("progressText").textContent = percentage + "% concluído";
  $("progressDetail").textContent = `${completed} de ${total} tarefas`;
}

// NAVEGAÇÃO
document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach(item =>
      item.classList.remove("active")
    );
    link.classList.add("active");
  });
});

// INICIALIZAÇÃO
async function initialize() {
  if (!db) {
    showApp(false);
    message(
      $("authMessage"),
      "O site está pronto, mas falta configurar o Supabase.",
      true
    );
    return;
  }

  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error(error);
    return;
  }

  if (data.session) {
    await startApp(data.session.user);
  }

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) {
      startApp(session.user);
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      showApp(false);
    }
  });
}

initialize();
