async function request(url, options = {}) { const response = await fetch(url, options); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Ошибка запроса'); return data; }
async function getObjects() { return request('/api/objects'); }
async function getObject(id) { return request('/api/objects/' + encodeURIComponent(id)); }
async function createObject(formData) { return request('/api/objects', { method: 'POST', body: formData }); }
async function updateObject(id, formData) { return request('/api/objects/' + encodeURIComponent(id), { method: 'PUT', body: formData }); }