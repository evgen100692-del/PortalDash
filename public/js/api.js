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
const jsonInit = (method, payload) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
async function getFaq() { return request('/api/faq'); }
async function getFaqItem(id) { return request('/api/faq/' + encodeURIComponent(id)); }
async function createFaq(payload) { return request('/api/faq', jsonInit('POST', payload)); }
async function updateFaq(id, payload) { return request('/api/faq/' + encodeURIComponent(id), jsonInit('PUT', payload)); }
async function deleteFaq(id) { return request('/api/faq/' + encodeURIComponent(id), { method: 'DELETE' }); }
async function uploadFaqPhoto(file) { const fd = new FormData(); fd.append('photo', file); return request('/api/faq/upload', { method: 'POST', body: fd }); }
async function uploadFaqFile(file) { const fd = new FormData(); fd.append('file', file); return request('/api/faq/upload-file', { method: 'POST', body: fd }); }
async function getNotifications() { return request('/api/notifications'); }
async function getEntityNotifications(entity, id) {
  return request('/api/notifications?entity=' + encodeURIComponent(entity) + '&id=' + encodeURIComponent(id));
}
async function clearNotifications() { return request('/api/notifications', { method: 'DELETE' }); }
async function getComplaints(objectId) { return request('/api/complaints?object_id=' + encodeURIComponent(objectId)); }
async function createComplaint(payload) { return request('/api/complaints', jsonInit('POST', payload)); }
async function deleteComplaint(id) { return request('/api/complaints/' + encodeURIComponent(id), { method: 'DELETE' }); }