import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getProfile, dashboardFor, logout } from "./auth.js";
import { ROUTES, ROLE_LABELS } from "./utils/constants.js";

/**
 * Protect a page. Usage on any private page:
 *
 *   <script>document.documentElement.classList.add("auth-pending")</script>   (in <head>)
 *   <script type="module">
 *     import { requireAuth } from "/js/auth-guard.js";
 *     const { profile } = await requireAuth(["admin", "headteacher"]);
 *   </script>
 *
 * Omit the array to allow any signed-in, active user.
 * The page stays hidden until the check passes.
 * This is a convenience layer; firestore.rules is the real enforcement.
 */
export function requireAuth(allowedRoles = null) {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, async (user) => {
      stop();

      if (!user) {
        const next = encodeURIComponent(location.pathname + location.search);
        return location.replace(`${ROUTES.LOGIN}?next=${next}`);
      }

      const profile = await getProfile(user.uid).catch(() => null);

      if (!profile || profile.active !== true) {
        await logout();
        return;
      }
      if (allowedRoles && !allowedRoles.includes(profile.role)) {
        return location.replace(dashboardFor(profile));
      }

      document.documentElement.classList.remove("auth-pending");
      wirePage(profile);
      resolve({ user, profile });
    });
  });
}

/** On login/forgot-password: skip ahead if already signed in. */
export function redirectIfSignedIn() {
  const stop = onAuthStateChanged(auth, async (user) => {
    stop();
    if (!user) return;
    const profile = await getProfile(user.uid).catch(() => null);
    if (profile && profile.active === true) location.replace(dashboardFor(profile));
  });
}

function wirePage(profile) {
  document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = profile.fullName || profile.email));
  document.querySelectorAll("[data-user-role]").forEach((el) => (el.textContent = ROLE_LABELS[profile.role] || profile.role));
  document.querySelectorAll("[data-logout]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    })
  );
}
