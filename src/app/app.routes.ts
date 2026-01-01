import { Routes } from '@angular/router';
import { NoiseComponent as Noise } from './tests/noise/noise';
import { NoiseWithMouse as NoiseWithMouse } from './tests/noise-with-mouse/noise-with-mouse';
import { NoiseDifferential } from './tests/noise-differential/noise-differential';
import { NoiceWithSeed as NoiseWithSeed } from './tests/noise-with-seed/noise-with-seed';
import { ColorWar } from './tests/color-war/color-war';
import { Sparks } from './tests/sparks/sparks';
import { ColorWar2 } from './tests/color-war-2/color-war-2';

export const routes: Routes = [
  { path: 'noise', component: Noise },
  { path: 'noiseWithMouse', component: NoiseWithMouse },
  { path: 'noiseDifferential', component: NoiseDifferential},
  { path: 'noiseWithSeed', component: NoiseWithSeed},
  { path: 'sparks', component: Sparks },
  { path: 'colorWar', component: ColorWar },
  { path: 'colorWar2', component: ColorWar2 },
  { path: '', redirectTo: '/noise', pathMatch: 'full' }, // domyślny przykład
  { path: '**', redirectTo: '/noise' } // obsługa błędnych adresów
];