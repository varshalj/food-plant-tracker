export function renderChips(container, items = []){
  container.innerHTML = '';
  items.forEach((it, idx) => {
    const el = document.createElement('div'); el.className = 'chip';
    const input = document.createElement('input'); input.value = it || ''; input.placeholder = 'plant name';
    const del = document.createElement('button'); del.textContent = '✖'; del.title = 'remove';
    del.onclick = () => { el.remove(); };
    el.appendChild(input);
    el.appendChild(del);
    container.appendChild(el);
  });
  // add ability to edit on the fly
}
export function getChipValues(container){
  return Array.from(container.querySelectorAll('input')).map(i => i.value);
}
