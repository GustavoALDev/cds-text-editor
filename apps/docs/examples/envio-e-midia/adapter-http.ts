// #region http
import type { ApplicationConfig } from '@angular/core';
import { provideRichText } from '@comodeviaser/rte-angular';
import { httpUploadAdapter } from '@comodeviaser/rte-angular/upload';

/** Quem devolve o token de acesso é o seu código de autenticação. */
export function uploadConfig(getToken: () => Promise<string>) {
  // Cada GET /csrf troca o cookie e o adaptador envia até 2 arquivos ao mesmo tempo:
  // busque o token uma vez e reaproveite.
  let csrf: Promise<string> | undefined;
  const csrfToken = () =>
    (csrf ??= getToken().then(async (token) => {
      const resposta = await fetch('/api/csrf', {
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
      });
      return ((await resposta.json()) as { token: string }).token;
    }));

  return {
    adapter: httpUploadAdapter({
      // Mesma origem do app: em desenvolvimento, o proxy do `ng serve` leva /api ao servidor.
      endpoint: '/api/upload',
      withCredentials: true,
      // Chamada a cada envio; pode devolver uma Promise.
      headers: async () => ({
        Authorization: `Bearer ${await getToken()}`,
        'X-CSRF-Token': await csrfToken(),
      }),
    }),
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRichText({ upload: uploadConfig(async () => 'outro-segredo') }),
  ],
};
// #endregion
