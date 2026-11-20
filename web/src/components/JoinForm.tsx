import { type FormEvent, useState } from "react";
import { barClass, Button, inputClass } from "./ui";

export default function JoinForm({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onJoin(name.trim());
  };
  return (
    <form className={barClass} onSubmit={submit}>
      <span>Você está assistindo.</span>
      <input
        className={inputClass}
        placeholder="Seu nome"
        maxLength={16}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <Button type="submit">Sentar na mesa</Button>
    </form>
  );
}
