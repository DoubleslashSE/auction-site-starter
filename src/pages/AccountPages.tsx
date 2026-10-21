import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ErrorMessage, fieldError, TextField } from "../components/ui";
import { api, call, newId } from "../lib/api";
import { completeSignIn } from "../lib/auth";
import { getConfig } from "../lib/config";
import { useCommand } from "../lib/hooks";
import { useSite } from "../site";

/** Ask for an account: the house emails a link to choose a password. */
export function SignUpPage() {
  const { house, info, signedIn, signIn } = useSite();
  const command = useCommand();
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [sentTo, setSentTo] = useState<string>();
  const { termsUrl } = getConfig();

  if (signedIn) {
    return (
      <div className="page narrow">
        <h1>You are signed in</h1>
        <p>
          <Link to="/">Browse lots</Link>
        </p>
      </div>
    );
  }

  if (info && !info.signUpOpen) {
    return (
      <div className="page narrow">
        <h1>Create an account</h1>
        <p>{house.name} opens accounts on invitation only. {info.supportEmail && <>Write to <a href={`mailto:${info.supportEmail}`}>{info.supportEmail}</a>.</>}</p>
      </div>
    );
  }

  if (sentTo) {
    return (
      <div className="page narrow">
        <h1>Check your email</h1>
        <p>
          If {sentTo} can open an account at {house.name}, a link to choose your password is on its way.
        </p>
        <p className="muted">
          Nothing arrived? Check your spam folder, or{" "}
          <button type="button" className="link-button" onClick={() => setSentTo(undefined)}>
            try again
          </button>
          .
        </p>
        <button type="button" className="button button-dark" onClick={signIn}>
          Sign in
        </button>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await command.run(() => call(api().POST("/api/v1/sign-ups", { body: { id: newId(), email } })))) setSentTo(email);
  };

  return (
    <div className="page narrow">
      <h1>Create an account</h1>
      <p>Enter your email. {house.name} sends you a link to choose a password; then you can bid, watch lots and sell.</p>
      <form className="form" style={{ gap: 16 }} onSubmit={submit} noValidate>
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(command.error, "email")} />
        {termsUrl && (
          <label className="check">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>
              I accept {house.name}'s{" "}
              <a href={termsUrl} target="_blank" rel="noreferrer">
                terms of sale
              </a>
            </span>
          </label>
        )}
        <ErrorMessage error={command.error} fields={["email"]} />
        <div className="actions">
          <button type="submit" className="button button-dark" disabled={command.pending || !email.trim() || (Boolean(termsUrl) && !accepted)}>
            Send me the link
          </button>
          <button type="button" className="link-button" onClick={signIn}>
            I already have an account
          </button>
        </div>
      </form>
    </div>
  );
}

/** Where the house's sign-in sends people back: finishes the sign-in and continues where they were. */
export function SignedInPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeSignIn(location.search).then(
      (returnTo) => navigate(returnTo, { replace: true }),
      (e: unknown) => setError(e),
    );
  }, [location.search, navigate]);

  return (
    <div className="page narrow">
      {error ? (
        <>
          <h1>Sign-in did not work</h1>
          <ErrorMessage error={error} />
          <p>
            <Link to="/">Back to the lots</Link>
          </p>
        </>
      ) : (
        <p className="muted" aria-busy="true">
          Signing you in…
        </p>
      )}
    </div>
  );
}

export function HowItWorksPage() {
  const { house } = useSite();
  return (
    <div className="page narrow" style={{ maxWidth: 720 }}>
      <h1>How bidding works</h1>
      <ol style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 20 }}>
        <li>Create an account with your email and choose a password from the link we send you.</li>
        <li>Find a lot and place a bid of at least the amount shown. You confirm every bid: a bid is binding.</li>
        <li>If someone bids more, we email you. Watch a lot to get an email an hour before it ends.</li>
        <li>A bid in the last 2 minutes extends bidding by 2 minutes, so everyone gets a fair chance to answer.</li>
        <li>Some lots have a hidden reserve price: below it the lot is not sold. You can see whether it is met.</li>
        <li>When bidding ends, the highest bid wins. {house.name} contacts the winner about payment and collection.</li>
      </ol>
      <p className="muted">Bidders are shown by number on each lot, never by name.</p>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="page narrow">
      <h1>Page not found</h1>
      <p>
        <Link to="/">See all lots</Link>
      </p>
    </div>
  );
}
