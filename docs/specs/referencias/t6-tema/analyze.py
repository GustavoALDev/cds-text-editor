import json, sys, collections
res = json.load(open('results.json'))
def lin(c):
    c/=255
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def Y(rgb): r,g,b=[lin(x) for x in rgb]; return 0.2126*r+0.7152*g+0.0722*b
def cr(a,b):
    ya,yb=Y(a),Y(b)
    hi,lo=max(ya,yb),min(ya,yb)
    return (hi+0.05)/(lo+0.05)
CHECKS = {
 'C1 on-primary sobre primary (>=4.5)':        (lambda r: cr(r['roles']['primary']['on'], r['roles']['primary']['seed']), 4.5),
 'C2a on-primary sobre hover (>=4.5)':         (lambda r: cr(r['roles']['primary']['on'], r['roles']['primary']['primary-hover']), 4.5),
 'C2b on-primary sobre active (>=4.5)':        (lambda r: cr(r['roles']['primary']['on'], r['roles']['primary']['primary-active']), 4.5),
 'C3a primary-text sobre surface (>=4.5)':     (lambda r: cr(r['roles']['primary']['primary-text'], r['base']['surface']), 4.5),
 'C3b primary-text sobre surface-raised (>=4.5)': (lambda r: cr(r['roles']['primary']['primary-text'], r['base']['surface-raised']), 4.5),
 'C4 focus sobre surface (>=3)':               (lambda r: cr(r['base']['focus'], r['base']['surface']), 3.0),
 'C5a text sobre surface (>=7)':               (lambda r: cr(r['base']['text'], r['base']['surface']), 7.0),
 'C5b text-muted sobre surface (>=4.5)':       (lambda r: cr(r['base']['text-muted'], r['base']['surface']), 4.5),
 'C6a text sobre primary-subtle (>=4.5)':      (lambda r: cr(r['base']['text'], r['roles']['primary']['primary-subtle']), 4.5),
 'C6b primary-text sobre primary-subtle (>=4.5)': (lambda r: cr(r['roles']['primary']['primary-text'], r['roles']['primary']['primary-subtle']), 4.5),
}
total=len(res); summary=[]
for name,(fn,thr) in CHECKS.items():
    fails=[(fn(r),r) for r in res if fn(r)<thr]
    worst=min((fn(r) for r in res))
    summary.append((name,len(fails),worst))
    print(f'{name:50s} falhas {len(fails):3d}/{total}   pior {worst:5.2f}')
    if '-v' in sys.argv and fails:
        for v,r in sorted(fails,key=lambda x:x[0])[:6]: print('      ',round(v,2),r['mode'],r['seed'])
