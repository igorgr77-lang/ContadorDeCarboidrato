// Configurações do Google Sheets
const SHEET_ID = '11jqNBtvlDbS6JDLvLlzEdtR2aOggbnJG';

// Estado da aplicação
let database = []; // Array unificado de alimentos
let currentMeal = [];

// Elementos DOM
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const mealList = document.getElementById('mealList');
const totalCarbsEl = document.getElementById('totalCarbs');
const syncBtn = document.getElementById('syncBtn');
const clearMealBtn = document.getElementById('clearMealBtn');

// Elementos DOM (Modal)
const weightModal = document.getElementById('weightModal');
const modalFoodName = document.getElementById('modalFoodName');
const modalFoodCoeff = document.getElementById('modalFoodCoeff');
const weightInput = document.getElementById('weightInput');
const addBtn = document.getElementById('addBtn');
const cancelBtn = document.getElementById('cancelBtn');
const toast = document.getElementById('toast');

let selectedFoodForModal = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadCachedData();
    loadCachedMeal();
    
    // Se não tiver dados cacheados, busca automaticamente
    if (database.length === 0) {
        syncDatabase();
    }
    
    setupEventListeners();
});

function setupEventListeners() {
    syncBtn.addEventListener('click', syncDatabase);
    
    searchInput.addEventListener('input', handleSearch);
    searchInput.addEventListener('focus', handleSearch);
    
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.focus();
        handleSearch();
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.classList.add('hidden');
        }
    });

    cancelBtn.addEventListener('click', closeModal);
    addBtn.addEventListener('click', handleAddItem);
    weightInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAddItem();
    });
    
    clearMealBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar a refeição atual?')) {
            currentMeal = [];
            saveMeal();
            renderMeal();
        }
    });
}

// --- Lógica de JSONP (Burlar CORS do file:// nativamente) ---
function fetchGoogleSheetJSONP(sheetName) {
    return new Promise((resolve, reject) => {
        const callbackName = 'gvizCallback_' + Math.round(100000 * Math.random());
        
        window[callbackName] = function(data) {
            delete window[callbackName];
            resolve(data);
        };
        
        const script = document.createElement('script');
        // Adicionado headers=1 para forçar o Google a identificar a primeira linha como cabeçalho
        script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json;responseHandler:${callbackName}&headers=1&sheet=${encodeURIComponent(sheetName)}&tq=select%20*`;
        script.onerror = () => reject(new Error('Falha ao carregar script do Google Sheets'));
        document.body.appendChild(script);
        
        setTimeout(() => {
            if (script.parentNode) script.parentNode.removeChild(script);
        }, 5000);
    });
}

async function syncDatabase() {
    syncBtn.classList.add('syncing');
    
    try {
        const [resFav, resTodos] = await Promise.all([
            fetchGoogleSheetJSONP('CONTAGEM RAPIDA'),
            fetchGoogleSheetJSONP('TODOS ALIMENTO SBD')
        ]);
        
        const favRows = resFav.table.rows || [];
        const todosRows = resTodos.table.rows || [];
        const favCols = resFav.table.cols || [];
        const todosCols = resTodos.table.cols || [];
        
        const newDatabase = [];
        const addedNames = new Set();
        
        // Identifica colunas (Favoritos)
        let favNameIdx = 0;
        let favCoeffIdx = favCols.findIndex(c => c && (c.label === 'K' || c.id === 'D'));
        if (favCoeffIdx === -1) favCoeffIdx = 3; 

        // Parse Favoritos
        favRows.forEach((rowObj, i) => {
            const row = rowObj.c;
            if (row && row[favNameIdx] && row[favCoeffIdx] && row[favNameIdx].v !== null) {
                const name = String(row[favNameIdx].v).trim();
                let coeffVal = row[favCoeffIdx].v;
                
                if (typeof coeffVal === 'string') {
                    coeffVal = parseFloat(coeffVal.replace(',', '.'));
                }
                
                if (coeffVal !== null && !isNaN(coeffVal) && name !== '' && name.toLowerCase() !== 'alimento') {
                    newDatabase.push({
                        id: 'fav_' + i,
                        name: name,
                        coeff: coeffVal,
                        isFavorite: true
                    });
                    addedNames.add(name.toLowerCase());
                }
            }
        });
        
        // Identifica colunas (Todos)
        let todosNameIdx = 0;
        let todosCoeffIdx = todosCols.findIndex(c => c && (c.id === 'B' || c.label === 'Coeficiente'));
        if (todosCoeffIdx === -1) todosCoeffIdx = 1; 
        
        // Parse Todos
        todosRows.forEach((rowObj, i) => {
            const row = rowObj.c;
            if (row && row[todosNameIdx] && row[todosCoeffIdx] && row[todosNameIdx].v !== null) {
                const name = String(row[todosNameIdx].v).trim();
                let coeffVal = row[todosCoeffIdx].v;
                
                if (typeof coeffVal === 'string') {
                    coeffVal = parseFloat(coeffVal.replace(',', '.'));
                }
                
                if (coeffVal !== null && !isNaN(coeffVal) && name !== '' && name.toLowerCase() !== 'alimento' && !addedNames.has(name.toLowerCase())) {
                    newDatabase.push({
                        id: 'all_' + i,
                        name: name,
                        coeff: coeffVal,
                        isFavorite: false
                    });
                    addedNames.add(name.toLowerCase());
                }
            }
        });
        
        database = newDatabase;
        localStorage.setItem('carbDatabase', JSON.stringify(database));
        showToast(`Base atualizada! ${database.length} alimentos.`);
        
    } catch (error) {
        console.error("Erro ao sincronizar:", error);
        showToast('Erro ao sincronizar. Verifique a planilha.', true);
    } finally {
        syncBtn.classList.remove('syncing');
    }
}

function loadCachedData() {
    const cached = localStorage.getItem('carbDatabase');
    if (cached) {
        database = JSON.parse(cached);
    }
}

function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.style.background = isError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// --- Funções de Busca ---

function handleSearch() {
    const query = searchInput.value.toLowerCase().trim();
    
    if (query.length > 0) {
        clearSearchBtn.classList.remove('hidden');
    } else {
        clearSearchBtn.classList.add('hidden');
    }
    
    if (query.length < 2) {
        searchResults.classList.add('hidden');
        return;
    }
    
    const results = database
        .filter(item => item.name.toLowerCase().includes(query))
        .sort((a, b) => {
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;
            return a.name.localeCompare(b.name);
        })
        .slice(0, 50);
        
    renderSearchResults(results);
}

function renderSearchResults(results) {
    searchResults.innerHTML = '';
    
    if (results.length === 0) {
        searchResults.innerHTML = '<li class="text-muted" style="justify-content:center">Nenhum alimento encontrado</li>';
    } else {
        results.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="food-name-res">
                    ${item.name}
                    ${item.isFavorite ? '<span class="fav-icon">⭐</span>' : ''}
                </div>
                <div class="food-coeff-res">K: ${item.coeff.toFixed(2)}</div>
            `;
            li.addEventListener('click', () => openModal(item));
            searchResults.appendChild(li);
        });
    }
    
    searchResults.classList.remove('hidden');
}

// --- Funções do Modal ---

function openModal(food) {
    selectedFoodForModal = food;
    modalFoodName.textContent = food.name;
    modalFoodCoeff.textContent = `Coeficiente: ${food.coeff}`;
    weightInput.value = '';
    
    searchResults.classList.add('hidden');
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    
    weightModal.classList.remove('hidden');
    
    setTimeout(() => weightInput.focus(), 100);
}

function closeModal() {
    weightModal.classList.add('hidden');
    selectedFoodForModal = null;
}

// --- Funções da Refeição ---

function handleAddItem() {
    const weight = parseFloat(weightInput.value);
    
    if (isNaN(weight) || weight <= 0) {
        alert('Por favor, insira um peso válido maior que zero.');
        return;
    }
    
    if (selectedFoodForModal) {
        const carbs = weight * selectedFoodForModal.coeff;
        
        currentMeal.push({
            id: Date.now().toString(),
            food: selectedFoodForModal,
            weight: weight,
            carbs: carbs
        });
        
        saveMeal();
        renderMeal();
        closeModal();
    }
}

function removeItem(id) {
    currentMeal = currentMeal.filter(item => item.id !== id);
    saveMeal();
    renderMeal();
}

function saveMeal() {
    localStorage.setItem('currentMeal', JSON.stringify(currentMeal));
}

function loadCachedMeal() {
    const cached = localStorage.getItem('currentMeal');
    if (cached) {
        currentMeal = JSON.parse(cached);
        renderMeal();
    }
}

function renderMeal() {
    mealList.innerHTML = '';
    
    if (currentMeal.length === 0) {
        mealList.innerHTML = `
            <li class="empty-state">
                <div class="empty-icon">🍽️</div>
                <p>Sua refeição está vazia.</p>
                <span>Busque e adicione alimentos acima.</span>
            </li>
        `;
        totalCarbsEl.textContent = '0.0';
        return;
    }
    
    let totalCarbs = 0;
    
    [...currentMeal].reverse().forEach(item => {
        totalCarbs += item.carbs;
        
        const li = document.createElement('li');
        li.className = 'meal-item';
        li.innerHTML = `
            <div class="meal-item-info">
                <h4>${item.food.name}</h4>
                <div class="meal-item-details">${item.weight}g × ${item.food.coeff} (Coef)</div>
            </div>
            <div class="meal-item-right">
                <div class="meal-item-carbs">${item.carbs.toFixed(1)}g</div>
                <button class="delete-btn" aria-label="Remover" onclick="removeItem('${item.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/></svg>
                </button>
            </div>
        `;
        mealList.appendChild(li);
    });
    
    totalCarbsEl.textContent = totalCarbs.toFixed(1);
}
