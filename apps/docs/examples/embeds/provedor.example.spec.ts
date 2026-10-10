import { RTE_EMBED_PROVIDERS, toEmbed } from '@comodeviaser/rte-core/embeds';
import { describe, expect, it } from 'vitest';
import { MEU_PLAYER } from './provedor';

describe('provedor de embed próprio', () => {
  const providers = [...RTE_EMBED_PROVIDERS, MEU_PLAYER];

  it('monta o src do iframe a partir do endereço da página', () => {
    const embed = toEmbed('https://example.com/v/abcd1234', providers);
    expect(embed?.provider).toBe('meu-player');
    expect(embed?.src).toBe('https://player.example.com/embed/abcd1234');
  });

  it('sem o provedor na lista, o mesmo endereço é recusado', () => {
    expect(toEmbed('https://example.com/v/abcd1234')).toBeNull();
  });

  it('os provedores padrão continuam funcionando quando repetidos na lista', () => {
    expect(toEmbed('https://youtu.be/dQw4w9WgXcQ', providers)?.provider).toBe(
      'youtube',
    );
  });
});
