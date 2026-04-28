import { useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

type LoginFormProps = {
  initialContact?: string;
  initialPassword?: string;
  isLoading: boolean;
  error: string | null;
  onSubmit: (payload: { contact: string; password: string }) => Promise<void>;
};

export function LoginForm({
  initialContact = "",
  initialPassword = "",
  isLoading,
  error,
  onSubmit,
}: LoginFormProps) {
  const [contact, setContact] = useState(initialContact);
  const [password, setPassword] = useState(initialPassword);

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
        <label className="text-sm text-slate-300">Demo code</label>
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
        {isLoading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
