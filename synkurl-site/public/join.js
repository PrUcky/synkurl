// The waitlist form. Sends the answers to /api/join and shows what happens next.

import { setUpForm } from "/form-kit.js";
import "/share.js";

const form = document.getElementById("waitlist");

// Came from a model page (/join?model=arch&colour=rose-gold)? Say so. This stays in
// the page only: the waitlist form doesn't send the design or finish anywhere.
const MODELS = { arch: "Arch", dome: "Dome", spine: "Spine", stack: "Stack", box: "Box", "box-plus": "Box Plus" };
const FINISHES = { "blush-pink": "Blush Pink", "matte-black": "Matte Black", "dusk-violet": "Dusk Violet / Purple", "rose-gold": "Rose Gold" };
const params = new URLSearchParams(location.search);
const known = (list, key) => (Object.hasOwn(list, key) ? list[key] : null);
const model = known(MODELS, params.get("model"));
const finish = known(FINISHES, params.get("colour"));
const note = document.querySelector("[data-model-note]");
if (note && model) {
  note.textContent = `You were looking at ${model}${finish ? ` in ${finish}` : ""}. Thank you for your interest in this concept.`;
  note.hidden = false;
}
const done = document.getElementById("done");

setUpForm({
  form,
  collect: (data) => ({
    email: data.get("email"),
    phone_type: data.get("phone_type"),
    city: data.get("city"),
    family_size: data.get("family_size"),
    device_pick: data.get("device_pick") || "",
    is_adult: data.get("is_adult") === "yes",
    consent: data.get("consent") === "yes",
    lang: data.get("lang") || "en",
  }),
  onSuccess(body) {
    if (body.next === "check-email") {
      location.assign(body.recent ? "/check-email?sent=recent" : "/check-email");
      return;
    }
    if (body.next === "already") {
      document.getElementById("done-title").textContent = "You're already on the waitlist.";
      document.getElementById("done-text").textContent =
        "This email joined earlier, so there's nothing more to do. We'll email you when early access opens.";
    }
    form.hidden = true;
    done.hidden = false;
    done.classList.add("is-celebrating");
    done.focus();
  },
});
