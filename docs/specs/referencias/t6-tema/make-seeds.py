"""Gera seeds.json (sRGB, dentro do gamut) ou seeds_wide.json (oklch/p3, fora do sRGB)."""
import colorsys, json, sys

def srgb():
    seeds = ['#8514f5', '#f637e3', '#0546ff', '#ffffff', '#000000', '#808080', '#ffff00', '#fff9c4', '#ffeb3b', '#00ffff',
             '#a3ff00', '#00ff00', '#ff0000', '#0000ff', '#ff8800', '#ff69b4', '#800080', '#635bff', '#1db954', '#1d9bf0',
             '#8b4513', '#0a0a3c', '#fefefe', '#010101', '#e6e6fa', '#fffaf0', '#777777', '#767676', '#757575']
    for h in range(0, 360, 30):
        for s in (0, 0.5, 1.0):
            for l in (0.05, 0.2, 0.35, 0.5, 0.6, 0.7, 0.85, 0.97):
                r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
                seeds.append('#%02x%02x%02x' % tuple(round(255 * x) for x in (r, g, b)))
    return list(dict.fromkeys(seeds))

def wide():
    seeds = [f'oklch({L} {C} {h})' for L in (0.3, 0.5, 0.7, 0.9) for C in (0.1, 0.25, 0.37) for h in range(0, 360, 30)]
    return seeds + ['color(display-p3 1 0 0)', 'color(display-p3 0 1 0)', 'color(display-p3 0 0.8 1)', 'color(display-p3 1 0 1)']

wide_mode = len(sys.argv) > 1 and sys.argv[1] == 'wide'
json.dump(wide() if wide_mode else srgb(), open('seeds.json', 'w'))
print('seeds.json:', 'fora do sRGB' if wide_mode else 'dentro do sRGB')
