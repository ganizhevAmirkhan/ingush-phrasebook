let categories = {};
let currentCategory = null;

// Загружаем список категорий
async function loadCategories() {
    const catList = [
        "greetings","basic_phrases","personal_info","family","home","food","drinks",
        "travel","transport","hunting","danger","thermal","orientation","weather",
        "emotions","health","help","commands","tools","animals","time","numbers",
        "colors","money","shop","city","village","guests","communication","work","misc"
    ];

    for (let name of catList) {
        let data = await fetch(`categories/${name}.json`).then(r => r.json());
        categories[name] = data.items;
    }

    renderCategoryList(catList);
}

function renderCategoryList(catList) {
    const c = document.getElementById("categories");
    c.innerHTML = "";

    catList.forEach(cat => {
        let div = document.createElement("div");
        div.textContent = cat;
        div.onclick = () => loadCategory(cat);
        c.appendChild(div);
    });
}

function loadCategory(cat) {
    currentCategory = cat;

    const items = categories[cat];
    const container = document.getElementById("phrases");

    document.querySelector("main h2").textContent = cat;

    container.innerHTML = "";

    items.forEach(item => {
        let box = document.createElement("div");
        box.className = "phrase";

        box.innerHTML = `
            <b>${item.ru}</b><br>
            ${item.ing}<br>
            <i>${item.pron}</i><br>
        `;

        container.appendChild(box);
    });
}

// Поиск
document.getElementById("search").addEventListener("input", function () {
    let q = this.value.toLowerCase();

    if (q.length < 1) return;

    const container = document.getElementById("phrases");
    container.innerHTML = "";
    document.querySelector("main h2").textContent = "Результаты поиска";

    for (let cat in categories) {
        categories[cat].forEach(item => {
            if (
                item.ru.toLowerCase().includes(q) ||
                item.ing.toLowerCase().includes(q)
            ) {
                let box = document.createElement("div");
                box.className = "phrase";
                box.innerHTML = `
                    <b>${item.ru}</b><br>
                    ${item.ing}<br>
                    <i>${item.pron}</i><br>
                `;
                container.appendChild(box);
            }
        });
    }
});

// Запускаем
loadCategories();
