// The investor contact form. Sends the message to /api/investors.

import { setUpForm } from "/form-kit.js";

const form = document.getElementById("investor-form");
const done = document.getElementById("done");

setUpForm({
  form,
  collect: (data) => ({
    name: data.get("name"),
    email: data.get("email"),
    organisation: data.get("organisation"),
    investor_type: data.get("investor_type"),
    link: data.get("link"),
    message: data.get("message"),
    wants_deck: data.get("wants_deck") === "yes",
    consent: data.get("consent") === "yes",
  }),
  onSuccess() {
    form.hidden = true;
    done.hidden = false;
    done.classList.add("is-celebrating");
    done.focus();
  },
});
