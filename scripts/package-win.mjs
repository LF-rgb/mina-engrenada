// Gera a versão executável para Windows x64 (pasta + zip) sem precisar do Windows.
import { packager } from '@electron/packager';
const root = new URL('..', import.meta.url).pathname;
const keep = [/^\/package\.json$/, /^\/electron(\/|$)/, /^\/dist(\/|$)/, /^\/assets(\/|$)/];
const paths = await packager({
  dir: root, out: root + 'release', platform: 'win32', arch: 'x64', overwrite: true,
  name: 'Mina Engrenada', executableName: 'MinaEngrenada', asar: true,
  appCopyright: 'Mina Engrenada', win32metadata: { CompanyName: 'Moscon', FileDescription: 'Mina Engrenada', ProductName: 'Mina Engrenada' },
  ignore: (p) => p !== '' && !keep.some((r) => r.test(p)),
});
console.log('Pacote Windows:', paths);
