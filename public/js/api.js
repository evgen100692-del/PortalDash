async function request(url, options = {}) { const response = await fetch(url, options); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Ошибка запроса'); return data; }
async function getObjects() { return request('/api/objects'); }
async function createObject(formData) { return request('/api/objects', { method: 'POST', body: formData }); }