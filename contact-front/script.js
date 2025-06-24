const API_URL = 'http://localhost:3001/api/contact';
const form = document.getElementById('contactForm');
const container = document.getElementById('messagesContainer');
const submitBtn = document.getElementById('submitBtn');

let editingId = null;

// Crear o actualizar mensaje
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = {
    name: form.name.value,
    email: form.email.value,
    phone: form.phone.value,
    message: form.message.value
  };

  try {
    const res = await fetch(editingId ? `${API_URL}/${editingId}` : API_URL, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const data = await res.json();

    if (res.ok) {
      Swal.fire(editingId ? 'Actualizado' : 'Enviado', data.message || 'Mensaje procesado', 'success');
      form.reset();
      editingId = null;
      submitBtn.textContent = 'Enviar mensaje';
      loadMessages();
    } else {
      Swal.fire('Error', data.error || 'No se pudo procesar', 'error');
    }
  } catch (err) {
    Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
  }
});

// Mostrar mensajes
async function loadMessages() {
  container.innerHTML = '';
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    data.forEach(msg => {
      const card = document.createElement('div');
      card.className = 'card';

      card.innerHTML = `
        <strong>Nombre:</strong> ${msg.name}<br>
        <strong>Correo:</strong> ${msg.email}<br>
        <strong>Teléfono:</strong> ${msg.phone}<br>
        <strong>Mensaje:</strong> ${msg.message}<br>
      `;

      const buttons = document.createElement('div');
      buttons.className = 'card-buttons';

      const editBtn = document.createElement('button');
      editBtn.className = 'edit';
      editBtn.textContent = 'Editar';
      editBtn.addEventListener('click', () => {
        editingId = msg.id;
        form.name.value = msg.name;
        form.email.value = msg.email;
        form.phone.value = msg.phone;
        form.message.value = msg.message;
        submitBtn.textContent = 'Actualizar mensaje';
        form.scrollIntoView({ behavior: 'smooth' });
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete';
      deleteBtn.textContent = 'Eliminar';
      deleteBtn.addEventListener('click', () => deleteMessage(msg.id));

      buttons.appendChild(editBtn);
      buttons.appendChild(deleteBtn);
      card.appendChild(buttons);
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>Error al cargar mensajes</p>';
  }
}

// Eliminar mensaje
async function deleteMessage(id) {
  const confirm = await Swal.fire({
    title: '¿Eliminar mensaje?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (!confirm.isConfirmed) return;

  try {
    const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    const data = await res.json();
    Swal.fire('Eliminado', data.message, 'success');
    loadMessages();
  } catch (err) {
    Swal.fire('Error', 'No se pudo eliminar', 'error');
  }
}

// Inicializar
loadMessages();
