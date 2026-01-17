// Common plants for autosuggest fallback
const COMMON_PLANTS = [
  'apple', 'avocado', 'banana', 'basil', 'bean', 'beet', 'bell pepper', 'blueberry',
  'broccoli', 'cabbage', 'carrot', 'cauliflower', 'celery', 'chickpea', 'chili',
  'cilantro', 'cinnamon', 'coconut', 'corn', 'cucumber', 'cumin', 'eggplant',
  'garlic', 'ginger', 'grape', 'green bean', 'kale', 'lemon', 'lentil', 'lettuce',
  'lime', 'mango', 'mint', 'mushroom', 'oat', 'olive', 'onion', 'orange', 'oregano',
  'parsley', 'pea', 'peanut', 'pepper', 'pineapple', 'potato', 'pumpkin', 'quinoa',
  'radish', 'raspberry', 'rice', 'rosemary', 'spinach', 'squash', 'strawberry',
  'sweet potato', 'thyme', 'tomato', 'turmeric', 'walnut', 'watermelon', 'wheat',
  'zucchini'
];

let cachedPlants = [];

export function setCachedPlants(plants) {
  const all = [...new Set([...cachedPlants, ...plants.map(p => p.toLowerCase())])];
  cachedPlants = all.sort();
  localStorage.setItem('pt_plantCache', JSON.stringify(cachedPlants));
}

export function getCachedPlants() {
  if (cachedPlants.length === 0) {
    try {
      cachedPlants = JSON.parse(localStorage.getItem('pt_plantCache')) || [];
    } catch (e) {
      cachedPlants = [];
    }
  }
  return [...new Set([...cachedPlants, ...COMMON_PLANTS])].sort();
}

export function renderChips(container, items = []) {
  container.innerHTML = '';
  items.forEach((it) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'chip chip-wrapper';
    
    const input = document.createElement('input');
    input.value = it || '';
    input.placeholder = 'plant name';
    
    const suggestions = document.createElement('div');
    suggestions.className = 'suggestions';
    
    const del = document.createElement('button');
    del.textContent = '✖';
    del.title = 'remove';
    del.type = 'button';
    del.onclick = () => wrapper.remove();
    
    // Autosuggest logic
    input.addEventListener('input', () => {
      const val = input.value.toLowerCase().trim();
      if (val.length < 1) {
        suggestions.classList.remove('active');
        return;
      }
      
      const matches = getCachedPlants()
        .filter(p => p.includes(val) && p !== val)
        .slice(0, 6);
      
      if (matches.length === 0) {
        suggestions.classList.remove('active');
        return;
      }
      
      suggestions.innerHTML = matches
        .map(m => `<div class="suggestion-item">${m}</div>`)
        .join('');
      suggestions.classList.add('active');
    });
    
    input.addEventListener('blur', () => {
      setTimeout(() => suggestions.classList.remove('active'), 150);
    });
    
    input.addEventListener('keydown', (e) => {
      const items = suggestions.querySelectorAll('.suggestion-item');
      const selected = suggestions.querySelector('.selected');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!selected && items.length) items[0].classList.add('selected');
        else if (selected?.nextElementSibling) {
          selected.classList.remove('selected');
          selected.nextElementSibling.classList.add('selected');
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selected?.previousElementSibling) {
          selected.classList.remove('selected');
          selected.previousElementSibling.classList.add('selected');
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selected) {
          input.value = selected.textContent;
          suggestions.classList.remove('active');
        }
      } else if (e.key === 'Escape') {
        suggestions.classList.remove('active');
      }
    });
    
    suggestions.addEventListener('click', (e) => {
      if (e.target.classList.contains('suggestion-item')) {
        input.value = e.target.textContent;
        suggestions.classList.remove('active');
      }
    });
    
    wrapper.appendChild(input);
    wrapper.appendChild(suggestions);
    wrapper.appendChild(del);
    container.appendChild(wrapper);
  });
}

export function getChipValues(container) {
  return Array.from(container.querySelectorAll('input')).map(i => i.value);
}
