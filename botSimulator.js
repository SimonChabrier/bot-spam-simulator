import { chromium } from "playwright";

// === Configuration ===
const TARGET_URL = "https://edith.simschab.cloud/contact"; // URL de la page contenant le formulaire
const FILL_HONEYPOT = true;
const WAIT_BEFORE_SUBMIT = 2000;
const ENABLE_JS_SUBMISSION = true;
const FORM_NAME = "form_contact"; // Nom du formulaire à chercher

// === Fonctionnalités ===

// Vérifie si le champ est un champ CSRF ou un honeypot
function isCsrfField(name, id, value) {
  // Liste des mots-clés de sécurité à vérifier
  const csrfKeywords = [
    "csrf",
    "token",
    "security",
    "auth",
    "x-csrf",
    "xsrf",
    "anti-csrf",
    "request_token",
    "security_token",
    "security",
    "authenticity_token",
    "session_token",
    "anti_xss",
    "anti_csrf",
    "x-xsrf-token",
    "x-csrf-token"
  ];

  // Vérifie si l'ID, le nom ou la valeur du champ contient l'un des mots-clés de sécurité
  return (
    (id && csrfKeywords.some(kw => id.toLowerCase().includes(kw))) ||
    (name && csrfKeywords.some(kw => name.toLowerCase().includes(kw))) ||
    (value && csrfKeywords.some(kw => value.toLowerCase().includes(kw)))
  );
}

function getFakeValue(field) {
  const name = field.name?.toLowerCase() || "";
  if (field.type === "email") return "simschab@gmail.com";
  if (field.type === "tel") return "0663244789";
  if (field.type === "url") return "https://simschab.cloud";
  if (field.type === "number") return "42";
  if (field.tag === "textarea") return "Ceci est un message de simon alias JackChan qui contourne les sécurité :D.";
  if (field.type === "select-one") return "__SELECT__";
  if (name.includes("first") || name.includes("prenom")) return "Jacky";
  if (name.includes("last") || name.includes("nom")) return "Chan";
  if (name.includes("subject") || name.includes("sujet")) return "Demande de renseignement";
  if (name.includes("message")) return "Ceci est un message de test de bot.";
  return "test";
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 300, max = 1000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function typeLikeHuman(page, selector, text) {
  for (const char of text) {
    await page.type(selector, char);
    await delay(randomDelay(40, 200));
  }
}

// Simuler un mouvement de souris vers un élément de manière réaliste
async function hoverAndClick(page, selector) {
  const element = await page.$(selector);
  if (element) {
    const box = await element.boundingBox();
    if (box) {
      // Déplacer la souris au-dessus de l'élément et simuler un clic
      await page.mouse.move(box.x + Math.random() * box.width, box.y + Math.random() * box.height);
      await page.mouse.click(box.x + Math.random() * box.width, box.y + Math.random() * box.height);
      console.log(`Clic simulé sur : ${selector}`);
    }
  }
}

// === Script principal ===
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });

  // Recherche du formulaire avec le nom défini
  let form = await page.$(`form[name="${FORM_NAME}"]`);

  // Si le formulaire n'est pas trouvé, chercher un formulaire avec "contact" dans son nom ou sa classe
  if (!form) {
    form = await page.$('form[name*="contact"], form[class*="contact"]');
    if (!form) {
      console.log("Aucun formulaire trouvé.");
      await browser.close();
      return;
    }
    console.log("Formulaire trouvé avec 'contact' dans le nom ou la classe.");
  } else {
    console.log(`Formulaire "${FORM_NAME}" trouvé.`);
  }

  const fields = await form.$$eval("input, textarea, select", elements =>
    elements.map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.type,
      name: el.name,
      id: el.id,
      required: el.required,
      hidden:
        el.type === "hidden" ||
        el.offsetParent === null ||
        getComputedStyle(el).visibility === "hidden" ||
        getComputedStyle(el).display === "none"
    }))
  );

  // Filtrer les champs sans nom ou ID
  const validFields = fields.filter(field => field.name || field.id);

  for (const field of fields) {
    const selector = field.id ? `#${field.id}` : `[name="${field.name}"]`;

    if (field.hidden) {
      // Si c'est un champ caché, on vérifie s'il est déjà rempli
      if (FILL_HONEYPOT) {
        let currentValue = "";
        try {
          currentValue = await page.$eval(selector, el => el.value);
        } catch {
          console.log(`Impossible de lire la valeur de ${field.name}`);
        }

        // Si le champ est caché et déjà rempli, on l'ignore
        if (currentValue && currentValue.trim() !== "") {
          console.log(`Ignoré (honeypot rempli) : ${field.name} avec "${currentValue}"`);
          continue;
        }

        // Si c'est un champ caché sans valeur et FILL_HONEYPOT est true, on peut le remplir
        if (!currentValue) {
          if (isCsrfField(field.name, field.id)) {
            console.log(`Ignoré (CSRF) : ${field.name}`);
            continue;
          }

          // Remplir le champ caché
          const value = getFakeValue(field);
          try {
            await page.evaluate(
              ({ selector, value }) => {
                const el = document.querySelector(selector);
                if (el) el.value = value;
              },
              { selector, value }
            );
            console.log(`Rempli (honeypot) : ${field.name} avec "${value}"`);
          } catch (e) {
            console.log(`Erreur pour ${field.name} : ${e.message}`);
          }
        }
      } else {
        console.log(`Ignoré (honeypot désactivé) : ${field.name}`);
      }
    } else {
      // Si ce n'est pas un champ caché, on remplit les champs visibles
      const value = getFakeValue(field);

      try {
        // Ajouter un mouvement de souris avant de saisir ou interagir
        await hoverAndClick(page, selector);
        await delay(randomDelay(1000, 1500)); // Simulation de temps d'attente entre les actions humaines

        if (field.tag === "select") {
          const options = await page.$$eval(`${selector} option`, opts =>
            opts.map(o => ({ value: o.value, text: o.textContent }))
          );
          const validOption = options.find(o => o.value && o.value.trim() !== "");
          if (validOption) {
            await page.selectOption(selector, validOption.value);
            console.log(`Sélectionné : ${field.name} → ${validOption.text}`);
          } else {
            console.log(`Aucune option valide pour : ${field.name}`);
          }
        } else if (field.type === "checkbox" || field.type === "radio") {
          await page.check(selector);
          console.log(`Coché : ${field.name}`);
        } else if (field.tag === "textarea" || value.length > 10) {
          await typeLikeHuman(page, selector, value);
          console.log(`Saisi (lettre par lettre) : ${field.name}`);
        } else if (field.type === "tel") {
          await typeLikeHuman(page, selector, value);
          console.log(`Saisi (lettre par lettre) : ${field.name}`);
        } else {
          await page.fill(selector, value);
          console.log(`Saisi : ${field.name}`);
        }
      } catch (e) {
        console.log(`Erreur pour ${field.name} : ${e.message}`);
      }

      await delay(randomDelay(1000, 2000)); // Délai entre chaque action
    }
  }

  if (WAIT_BEFORE_SUBMIT > 0) {
    console.log(`Attente ${WAIT_BEFORE_SUBMIT}ms avant soumission...`);
    await delay(WAIT_BEFORE_SUBMIT);
  }

  if (ENABLE_JS_SUBMISSION) {
    const submitBtn = await form.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log("Formulaire soumis via clic JS");
    } else {
      console.log("Aucun bouton de soumission trouvé");
    }
  } else {
    await form.evaluate(formEl => formEl.submit());
    console.log("Formulaire soumis via .submit()");
  }

  await delay(1000);
  await browser.close();
})();
