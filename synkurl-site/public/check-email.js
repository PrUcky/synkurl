// "Check your inbox": if we sent the email only minutes ago, say so.
import "/share.js";

if (new URLSearchParams(location.search).get("sent") === "recent") {
  document.getElementById("sent-recent").hidden = false;
}
