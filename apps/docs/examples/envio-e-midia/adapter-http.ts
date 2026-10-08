// #region http
import type { ApplicationConfig } from '@angular/core';
import { provideRichText } from '@cds/rte-angular';
import { httpUploadAdapter } from '@cds/rte-angular/upload';

/** Quem devolve o token de acesso é o seu código de autenticação. */
export function uploadConfig(getToken: () => Promise<string>) {
  return {
    adapter: httpUploadAdapter({
      // Mesma origem do app: em desenvolvimento, o proxy do `ng serve` leva /api ao servidor.
      endpoint: '/api/upload',
      withCredentials: true,
      // Chamada a cada envio; pode devolver uma Promise.
      headers: async () => {
        const csrf = (await (
          await fetch('/api/csrf', { credentials: 'include' })
        ).json()) as { token: string };
        return {
          Authorization: `Bearer ${await getToken()}`,
          'X-CSRF-Token': csrf.token,
        };
      },
    }),
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRichText({ upload: uploadConfig(async () => 'token-do-usuario') }),
  ],
};
// #endregion
