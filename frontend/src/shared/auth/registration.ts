import { z } from 'zod';
import { fetchApi } from '../api/client.ts';

interface RegistrationInput {
  name: string;
  email: string;
  password: string;
}

const registeredAccountSchema = z.object({
  id: z.union([z.string().min(1), z.number()]),
  email: z.email(),
});

export async function registerAccount(
  { name, email, password }: RegistrationInput,
  signal: AbortSignal,
) {
  const response = await fetchApi<unknown>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
    signal,
  });
  return registeredAccountSchema.parse(response);
}
