// Configuración: ajusta según entorno real (puedes poner tu dominio o usar variable)
const API_BASE = (() => {
  // Si estás en local dev
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  // Ejemplo VPS – cámbialo por tu dominio/puerto real si aplica
  return 'http://167.172.150.250:3266'; 
})();

const CONTACT_ENDPOINT = `${API_BASE}/api/contact`;

const form = document.getElementById('contactForm');
const submitBtn = document.getElementById('submitBtn');
const termsCheckbox = document.getElementById('termsCheckbox');

// Validadores simples
function isValidEmail(email) {
  return /^\S+@\S+\.\S+$/.test(email);
}

function setButtonLoading(loading) {
  if (loading) {
    submitBtn.disabled = true;
    submitBtn.dataset.originalText = submitBtn.textContent;
    submitBtn.textContent = 'Enviando...';
    submitBtn.classList.add('loading');
  } else {
    submitBtn.disabled = false;
    submitBtn.textContent = submitBtn.dataset.originalText || 'Enviar mensaje';
    submitBtn.classList.remove('loading');
  }
}

// callbacks opcionales para reCAPTCHA
function onRecaptchaSuccess() {
  // Si quieres activar el botón sólo cuando hay token válido
  // submitBtn.disabled = false;
}

function onRecaptchaExpired() {
  Swal.fire('Captcha', 'El reCAPTCHA expiró, por favor vuelve a validarlo.', 'warning');
}

async function postContact(payload) {
  const resp = await fetch(CONTACT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let body;
  try {
    body = await resp.json();
  } catch {
    body = {};
  }
  if (!resp.ok) {
    const error = new Error(body.error || 'Error en la petición');
    error.status = resp.status;
    error.body = body;
    throw error;
  }
  return body;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // trims
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();
  const message = form.message.value.trim();

  // Validaciones front
  if (!name || !email || !message) {
    Swal.fire('Faltan datos', 'Llena los campos obligatorios.', 'warning');
    return;
  }
  if (!isValidEmail(email)) {
    Swal.fire('Email inválido', 'Revisa tu correo electrónico.', 'warning');
    return;
  }
  if (!termsCheckbox.checked) {
    Swal.fire('Términos', 'Debes aceptar los términos y condiciones.', 'warning');
    return;
  }

  const captchaToken = typeof grecaptcha !== 'undefined' ? grecaptcha.getResponse() : '';
  if (!captchaToken) {
    Swal.fire('Captcha', 'Por favor confirma que no eres un robot.', 'warning');
    return;
  }

  const payload = {
    name,
    email,
    phone,
    message,
    accepted_terms: termsCheckbox.checked,
    token: captchaToken,
  };

  setButtonLoading(true);
  try {
    const result = await postContact(payload);
    Swal.fire({
      icon: 'success',
      title: '¡Listo!',
      text: result.message || 'Tu mensaje fue enviado correctamente.',
      timer: 2500,
      showConfirmButton: false,
    });
    form.reset();
    if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
  } catch (err) {
    console.error('Error al enviar contacto:', err);
    if (err.status === 400 || err.status === 422) {
      Swal.fire('Error', err.body?.error || 'Datos inválidos.', 'error');
    } else if (err.status === 403) {
      Swal.fire('Captcha', err.body?.error || 'Verificación fallida.', 'error');
    } else if (err.status === 409) {
      Swal.fire('Duplicado', err.body?.error || 'Ya existe.', 'warning');
    } else {
      Swal.fire('Error', 'No se pudo conectar con el servidor. Revisa CORS/red.', 'error');
    }
  } finally {
    setButtonLoading(false);
  }
});
