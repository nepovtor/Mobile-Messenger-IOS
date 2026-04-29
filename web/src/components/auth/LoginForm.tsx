import { useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

type LoginFormProps = {
  initialPhone?: string;
  initialCode?: string;
  isLoading: boolean;
  error: string | null;
  codeSent: boolean;
  helperText: string | null;
  onRequestCode: (payload: { phone: string }) => Promise<void>;
  onVerifyCode: (payload: { phone: string; code: string }) => Promise<void>;
};

export function LoginForm({
  initialPhone = "",
  initialCode = "",
  isLoading,
  error,
  codeSent,
  helperText,
  onRequestCode,
  onVerifyCode,
}: LoginFormProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState(initialCode);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (codeSent) {
          await onVerifyCode({ phone, code });
          return;
        }

        await onRequestCode({ phone });
      }}
    >
      <div className="space-y-2">
        <label className="text-sm text-slate-300">Phone number</label>
        <Input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+375291234567"
        />
      </div>
      {codeSent ? (
        <div className="space-y-2">
          <label className="text-sm text-slate-300">SMS code</label>
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
          />
        </div>
      ) : null}
      {helperText ? (
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
          {helperText}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button block disabled={isLoading || !phone.trim()} type="button" onClick={() => void onRequestCode({ phone })}>
          {isLoading && !codeSent ? "Sending…" : "Get code"}
        </Button>
        <Button block disabled={isLoading || !phone.trim() || !code.trim()}>
          {isLoading && codeSent ? "Verifying…" : "Verify"}
        </Button>
      </div>
      <div className="text-xs leading-5 text-slate-400">
        Enter a real number in international format. Demo accounts stay available below.
      </div>
    </form>
  );
}

type DemoPasswordFormProps = {
  isLoading: boolean;
  error: string | null;
  onSubmit: (payload: { contact: string; password: string }) => Promise<void>;
};

export function DemoPasswordForm({
  isLoading,
  error,
  onSubmit,
}: DemoPasswordFormProps) {
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({ contact, password });
      }}
    >
      <div className="space-y-2">
        <label className="text-sm text-slate-300">Demo phone</label>
        <Input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="+15551230011"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-slate-300">Demo password</label>
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="demo1111"
        />
      </div>
      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      <Button block disabled={isLoading || !contact.trim() || !password.trim()}>
        {isLoading ? "Signing in…" : "Sign in with demo account"}
      </Button>
    </form>
  );
}
