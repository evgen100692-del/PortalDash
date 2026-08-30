async function request(url, options = {}) { const response = await fetch(url, options); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Ошибка запроса'); return data; }
async function getObjects() { return request('/api/objects'); }
async function getObject(id) { return request('/api/objects/' + encodeURIComponent(id)); }
async function createObject(formData) { return request('/api/objects', { method: 'POST', body: formData }); }
async function updateObject(id, formData) { return request('/api/objects/' + encodeURIComponent(id), { method: 'PUT', body: formData }); }
async function deleteObject(id) { return request('/api/objects/' + encodeURIComponent(id), { method: 'DELETE' }); }
async function getChemicals() { return request('/api/chemicals'); }
async function getChemical(id) { return request('/api/chemicals/' + encodeURIComponent(id)); }
async function createChemical(formData) { return request('/api/chemicals', { method: 'POST', body: formData }); }
async function updateChemical(id, formData) { return request('/api/chemicals/' + encodeURIComponent(id), { method: 'PUT', body: formData }); }
async function deleteChemical(id) { return request('/api/chemicals/' + encodeURIComponent(id), { method: 'DELETE' }); }