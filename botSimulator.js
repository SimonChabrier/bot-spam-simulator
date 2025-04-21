import { chromium } from "playwright";

// === Configuration ===
const TARGET_URL = "https://edith.fr/contact"; // l'URL de la page contenant le formulaire en local ou directement sur le web peut être utilisé
const FILL_HONEYPOT = false; //  est ce qu'on veut lui dire de remplir les champs cachés (nottament celui qui va le faire considérer comme un bot pr le serveur : confirm_email)
const WAIT_BEFORE_SUBMIT = 4000; // est ce qu'on veut lui dire d'attendre avant de soumettre le formulaire (pour simuler un humain)
const ENABLE_JS_SUBMISSION = true; // est ce qu'on veut lui dire de soumettre le formulaire via JS (pour simuler un humain) ou via le submit du formulaire (pour simuler un bot)
const FOMR_NAME = "contact"; // le nom du formulaire à remplir
// === Fonctions utilitaires ===
function isHoneypotField(name, id) {
  const keywords = ["confirm", "trap", "honeypot", "spam", "timer", "context", "origin", "security"];
  return keywords.some(kw => (name && name.toLowerCase().includes(kw)) || (id && id.toLowerCase().includes(kw)));
}

// === Fonction pour vérifier si le champ est un champ CSRF ===
function isCsrfField(name, id) {
  return (id && id.toLowerCase().includes("csrf")) || (name && name.toLowerCase().includes("csrf"));
}

// === Fonction pour générer une valeur factice ===
function getFakeValue(field) {
  const name = field.name || "";
  if (field.type === "email") return "bot@example.com";
  if (field.type === "tel") return "0600000000";
  if (field.type === "url") return "https://example.com";
  if (field.tag === "textarea") return "Ceci est un message généré automatiquement.";
  if (field.type === "number") return "42";
  if (name.toLowerCase().includes("first")) return "Bot";
  if (name.toLowerCase().includes("last")) return "Testeur";
  if (name.toLowerCase().includes("subject")) return "Test";
  if (name.toLowerCase().includes("message")) return "Ceci est un message de test.";
  return "test";
}

// === Fonction principale ===
// Cette fonction va lancer le navigateur, ouvrir la page cible, trouver le formulaire et remplir les champs
// en fonction de leur type et de leur état (visible/caché), puis soumettre le formulaire
// en fonction de la configuration définie ci-dessus.
// Elle va aussi gérer les erreurs et afficher des messages dans la console pour suivre le déroulement
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });

  const form = await page.$('form[name="' + FOMR_NAME + '"]');
  if (!form) {
    console.log("Aucun formulaire" + FOMR_NAME + "trouvé sur la page.");
    await browser.close();
    return;
  }

  console.log("Formulaire" + FOMR_NAME + "trouvé, analyse des champs...");

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

  for (const field of fields) {
    const selector = field.id ? `#${field.id}` : `[name="${field.name}"]`;

    if (field.hidden) {
      if (isCsrfField(field.name, field.id)) {
        console.log(`Ignoré : ${field.name} (CSRF)`);
        continue;
      }

      if (FILL_HONEYPOT) {
        let currentValue = "";
        try {
          currentValue = await page.$eval(selector, el => el.value);
        } catch {
          console.log(` Impossible de lire la valeur de ${field.name}`);
        }

        if (currentValue && currentValue.trim() !== "") {
          console.log(`Ignoré : ${field.name} (déjà rempli avec "${currentValue}")`);
          continue;
        }

        const value = getFakeValue(field);
        try {
          await page.evaluate(
            ({ selector, value }) => {
              const el = document.querySelector(selector);
              if (el) el.value = value;
            },
            { selector, value }
          );
          console.log(`Rempli : ${field.name} avec "${value}"`);
        } catch (e) {
          console.log(`Erreur pour ${field.name} : ${e.message}`);
        }
      } else {
        console.log(`Ignoré : ${field.name} (honeypot, FILL_HONEYPOT désactivé)`);
      }
    } else if (!field.hidden && !isHoneypotField(field.name, field.id)) {
      const value = getFakeValue(field);
      try {
        if (field.type === "checkbox") {
          await page.check(selector);
          console.log(`Coché : ${field.name}`);
        } else {
          await page.fill(selector, value);
          console.log(`Rempli : ${field.name} avec "${value}"`);
        }
      } catch (e) {
        console.log(`Erreur pour ${field.name} : ${e.message}`);
      }
    } else {
      console.log(`Ignoré : ${field.name} (honeypot ou CSRF)`);
    }
  }

  if (WAIT_BEFORE_SUBMIT > 0) {
    console.log(`Attente ${WAIT_BEFORE_SUBMIT} ms avant soumission...`);
    await page.waitForTimeout(WAIT_BEFORE_SUBMIT);
  }

  if (ENABLE_JS_SUBMISSION) {
    const submitBtn = await form.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log("Formulaire soumis via clic JS");
    } else {
      console.log("Aucun bouton de soumission trouvé dans le formulaire 'contact'");
    }
  } else {
    await form.evaluate(formEl => formEl.submit());
    console.log("Formulaire soumis via .submit()");
  }

  await page.waitForTimeout(WAIT_BEFORE_SUBMIT ?? 3000);
  await browser.close();
})();
