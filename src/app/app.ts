import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenubarModule } from 'primeng/menubar';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MenubarModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {

  items: MenuItem[] = [
    { 
      label: 'Noise Shader', 
      icon: 'pi pi-fw pi-database',
      routerLink: 'noise' 
    },
    { 
      label: 'Noise With Mouse', 
      icon: 'pi pi-fw pi-sliders-h',
      routerLink: 'noiseWithMouse' 
    },
    { 
      label: 'Differential Noise', 
      icon: 'pi pi-fw pi-wave-pulse', 
      routerLink: 'noiseDifferential' 
    },
    { 
      label: 'Noise With Seed', 
      icon: 'pi pi-fw pi-asterisk', 
      routerLink: 'noiseWithSeed' 
    },
    { 
      label: 'Sparks', 
      icon: 'pi pi-fw pi-bolt',
      routerLink: 'sparks' 
    },
    { 
      label: 'Color War', 
      icon: 'pi pi-fw pi-palette',
      routerLink: 'colorWar' 
    },
    { 
      label: 'Color War II', 
      icon: 'pi pi-fw pi-palette',
      routerLink: 'colorWar2' 
    },
    // { label: 'Settings', icon: 'pi pi-fw pi-cog' }
  ];

  async ngOnInit() {
    await this.initWebGPU();
  }

  async initWebGPU() {
    if (!navigator.gpu) {
        throw new Error("WebGPU nie jest wspierane w tej przeglądarce.");
    }

    // 1. Adapter - Twoja fizyczna karta graficzna
    const adapter: GPUAdapter | null = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("Nie znaleziono odpowiedniej karty graficznej.");
    }

    // 2. Device - Logiczne połączenie z kartą (to tutaj będziesz pisać WGSL)
    const device = await adapter.requestDevice();

    console.log("Połączono z GPU:", adapter!.info.vendor);
    return device;
  }

}
