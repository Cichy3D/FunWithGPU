import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { hsvToRgb } from '../../utils';

const N_COLORS = 256;
const INIT_POINTS = 10;

@Component({
  selector: 'app-color-war-2',
  imports: [],
  templateUrl: './color-war-2.html',
  styleUrl: './color-war-2.scss',
})
export class ColorWar2 implements OnInit, OnDestroy {

  @ViewChild('gpuCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private pipeline!: GPURenderPipeline;
  private uniformBuffer!: GPUBuffer;
  
  // Dane do wysłania do GPU (mouse.x, mouse.y, dummy, dummy, size.x, size.y, frame, dummy)
  private uniformData = new Float32Array(8); 
  private frameCount = 0;
  private resizeObserver?: ResizeObserver;
  private animationId: any;
  
  private textures: GPUTexture[] = [];
  private seedTextures: GPUTexture[] = [];
  private textureViews: GPUTextureView[] = [];
  private seedTextureViews: GPUTextureView[] = [];
  private pingPongIndex = 0;
  private textureFormat: GPUTextureFormat = 'rgba8unorm';
  private palette = new Uint8Array(N_COLORS * 4);
  
  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    this.uniformData[0] = event.clientX;
    this.uniformData[1] = event.clientY;
    this.uniformData[3] = event.getModifierState('Shift') ? 1.0 : 0.0;
    this.uniformData[2] = (event.buttons & 1) ? 1.0 : 0.0;
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.uniformData[3] = 1.0;
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      this.uniformData[3] = 0.0;
    }
  }

  @HostListener('window:blur')
  @HostListener('window:mouseleave')
  onWindowBlur() {
    this.uniformData[2] = 0; // Left
    this.uniformData[3] = 0; // Shift
  }

  onMouseDown(event: MouseEvent) {
    event.preventDefault(); event.stopPropagation();
    if (event.button === 0) this.uniformData[2] = 1.0;
    this.uniformData[3] = event.getModifierState('Shift') ? 1.0 : 0.0;
    //if (event.button === 2) this.uniformData[3] = 1.0;
  }

  onMouseUp(event: MouseEvent) {
    event.preventDefault(); event.stopPropagation();
    if (event.button === 0) this.uniformData[2] = 0.0;
    //if (event.button === 2) this.uniformData[3] = 0.0;
  }
  
  async ngOnInit() {
    const canvas = this.canvasRef.nativeElement;
    const adapter = await navigator.gpu.requestAdapter();
    this.device = await adapter!.requestDevice();
    this.context = canvas.getContext('webgpu')!;
    
    this.textureFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.textureFormat,
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
    });
    
    // 1. Tworzenie Bufora Uniform
    this.uniformBuffer = this.device.createBuffer({
      size: this.uniformData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    // 2. Tworzenie Pipeline
    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({ code: this.noiseShader }),
        entryPoint: 'vs_main',
      },
      fragment: {
        module: this.device.createShaderModule({ code: this.noiseShader }),
        entryPoint: 'fs_main',
        targets: [{ format: this.textureFormat }, { format: 'r32float' }],
      },
      primitive: { topology: 'triangle-strip' },
    });
    
    // this.initTextures();
    this.resize();
    
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.canvasRef.nativeElement);
    
    this.render();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  private initPalette() {
    for (let i = 0; i < N_COLORS; i++) {
      const hue = i / N_COLORS; 
      const [r, g, b] = hsvToRgb(hue, 0.8, 0.9); // S=1.0 (max nasycenie), V=1.0 (max jasność)
      const offset = i * 4;
      this.palette[offset + 0] = r;
      this.palette[offset + 1] = g;
      this.palette[offset + 2] = b;
      this.palette[offset + 3] = 255;
    }
  }
  
  private initTextures() {
    this.initPalette();
    const width = this.canvasRef.nativeElement.width;
    const height = this.canvasRef.nativeElement.height;
    console.log('rozmiar ekranu', width, height);
    const initialSeedData = new Float32Array(width * height);
    const initialColorData = new Uint8Array(width * height * 4);
    for (let i = 0; i < initialSeedData.length; i++) {
      initialSeedData[i] = Math.random()*1000000;
    }
    if (INIT_POINTS < 1) {
      for (let i = 0; i < width * height; i++) {
        let iColor = Math.floor(Math.random()*N_COLORS);
        for (let j = 0; j < 4; j++) initialColorData[i*4 + j] = this.palette[iColor*4 + j];
      }
    } else {
      for (let i = 0; i < width * height; i++) {
        for (let j = 0; j < 3; j++) initialColorData[i*4 + j] = 0;
        initialColorData[i*4 + 3] = 255;
      }
      for (let i = 0; i < INIT_POINTS; i++) {
        for (let iColor = 0; iColor < N_COLORS; iColor++) {
          let p = Math.floor(Math.random()*width) + Math.floor(Math.random()*height)*width;
           for (let j = 0; j < 4; j++) initialColorData[p*4 + j] = this.palette[iColor*4 + j];
        }
      }
    }
    // Czyścimy stare tekstury jeśli istnieją
    this.textures.forEach(t => t.destroy());
    this.seedTextures.forEach(t => t.destroy());

    for (let i = 0; i < 2; i++) {
      this.textures[i] = this.device.createTexture({
        size: [width, height],
        format: this.textureFormat,
        usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
      });
      if (i === 0) {
        this.device.queue.writeTexture(
          { texture: this.textures[i] },
          initialColorData,
          { bytesPerRow: width * 4 },
          [width, height]
        );
      }
      this.textureViews[i] = this.textures[i].createView();
      
      this.seedTextures[i] = this.device.createTexture({
        size: [width, height],
        format:'r32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
      });
      if (i === 0) {
        this.device.queue.writeTexture(
          { texture: this.seedTextures[i] },
          initialSeedData,
          { bytesPerRow: width * 4 },
          [width, height]
        );
      }
      this.seedTextureViews[i] = this.seedTextures[i].createView();

    }
  }
  
  render = () => {
    const canvas = this.canvasRef.nativeElement;
    
    // Aktualizacja danych
    this.uniformData[4] = canvas.width;
    this.uniformData[5] = canvas.height;
    this.uniformData[6] = this.frameCount++;
    this.uniformData[7] = window.devicePixelRatio || 1;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

    const backBufferIndex = this.pingPongIndex;
    const frontBufferIndex = (this.pingPongIndex + 1) % 2;
    const canvasTexture = this.context.getCurrentTexture();

    // Dynamiczna BindGroup dla tej klatki
    const currentBindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.textureViews[backBufferIndex] }, 
        { binding: 2, resource: this.seedTextureViews[backBufferIndex] }
      ],
    });

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.textureViews[frontBufferIndex],
        clearValue: { r: 1, g: 0, b: 0, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      },
      {
        view: this.seedTextureViews[frontBufferIndex], // Nowy Seed
        clearValue: { r: 0, g: 1, b: 0, a: 1 },
        loadOp: 'clear', storeOp: 'store'
      }],
    });
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, currentBindGroup);
    passEncoder.draw(4); // Rysujemy prostokąt z 4 wierzchołków
    passEncoder.end();

    // KOPIOWANIE: Przerzucamy wynik z tekstury B prosto do Canvasu
    commandEncoder.copyTextureToTexture(
      { texture: this.textures[frontBufferIndex] }, // Źródło (B)
      { texture: canvasTexture },                  // Cel (Ekran)
      [this.canvasRef.nativeElement.width, this.canvasRef.nativeElement.height]
    );

    this.device.queue.submit([commandEncoder.finish()]);
    this.pingPongIndex = frontBufferIndex; // Zamiana ról
    this.animationId = requestAnimationFrame(this.render);
  };

  resize() {
    const canvas = this.canvasRef.nativeElement;
    
    // Pobieramy rozmiar z CSS (uwzględniając gęstość pikseli ekranu)
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * devicePixelRatio;
    const height = canvas.clientHeight * devicePixelRatio;

    // Sprawdzamy, czy rozmiar faktycznie się zmienił, żeby nie rekonfigurować bez potrzeby
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;

      this.context.configure({
        device: this.device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: 'premultiplied', // lub 'opaque'
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
      });
    }

    this.initTextures();
}

  noiseShader: string = `
    struct Inputs {
      mouse: vec4f,
      size: vec2f,
      frame: f32,
      zoom: f32
    };

    struct FragmentOutput {
      @location(0) color: vec4f,
      @location(1) nextSeed: f32,
    };

    struct RandOutput {
      seed: u32,
      value: f32,
    };

    struct ColorPower {
      color: vec4f,
      power: f32,
    };

    @group(0) @binding(0) var<uniform> inputs: Inputs;
    @group(0) @binding(1) var feedbackTexture: texture_2d<f32>;
    @group(0) @binding(2) var seedTexture: texture_2d<f32>;

    @vertex
    fn vs_main(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
      var pos = array<vec2f, 4>(
        vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1)
      );
      return vec4f(pos[id], 0.0, 1.0);
    }

    @fragment
    fn fs_main(@builtin(position) pos: vec4f) -> FragmentOutput {

      let initCoords = vec2i(pos.xy);
      var coords = vec2i(pos.xy);
      let frame = u32(inputs.frame);
      var seed = u32(textureLoad(seedTexture, coords, 0).r);
      var random = rand(seed);
      seed = random.seed;
      let dirIdx = u32(random.value * 9);

      var war: array<ColorPower, 9>;
      var uniqueColorsCount = 0u;

      for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
          let neighborColor = textureLoad(feedbackTexture, coords + vec2i(x, y), 0);

          if (all(neighborColor.rgb <= vec3f(0.01))) {
            continue; // Ignorujemy kolor czarny (#000)
          }

          var res = rand(seed);
          seed = res.seed;
          var currentPower = res.value;

          var found = false;
          for (var i = 0u; i < uniqueColorsCount; i++) {
            if (all(war[i].color == neighborColor)) {
              war[i].power += currentPower; // Sumujemy siły tego samego koloru
              found = true;
              break;
            }
          }
          if (!found) {
            war[uniqueColorsCount].color = neighborColor;
            war[uniqueColorsCount].power = currentPower;
            uniqueColorsCount++;
          }
        }
      }
      

      var winnerColor = textureLoad(feedbackTexture, coords, 0);
      var maxPower = -1.0;

      for (var i = 0u; i < uniqueColorsCount; i++) {
        if (war[i].power > maxPower) {
          maxPower = war[i].power;
          winnerColor = war[i].color;
        }
      }

      random = rand(seed);
      seed = random.seed;
      if (random.value > 0.25 && all(initCoords == clamp(initCoords, vec2i(2), vec2i(inputs.size) - vec2i(3)))) {
        var offset = vec2i(0);
        seed = rand(seed).seed; // prewencja upartych punktów, co nie chcą się zmienić
        random = rand(seed);
        seed = random.seed;
        if (random.value<0.5) { offset.x -= 1; }
        random = rand(seed);
        seed = random.seed;
        if (random.value<0.5) { offset.x += 1; }
        random = rand(seed);
        seed = random.seed;
        if (random.value<0.5) { offset.y -= 1; }
        random = rand(seed);
        seed = random.seed;
        if (random.value<0.5) { offset.y += 1; }

        if((initCoords.x + initCoords.y)%2 == 0) {
          winnerColor = textureLoad(feedbackTexture, initCoords + offset, 0);
        } else {
          winnerColor = textureLoad(feedbackTexture, initCoords - offset, 0);
        }
      }

      random = rand(seed);
      seed = random.seed;
      if (random.value > 0.75 && inputs.mouse.z==1 && all(initCoords == clamp(initCoords, vec2i(0), vec2i(inputs.size) - vec2i(1)))) {
        
        let mousePos = inputs.mouse.xy * inputs.zoom;
        var delta: vec2f = pos.xy - mousePos; // Wektor od myszy do piksela
        let dist: f32 = length(delta);
        var force = -500.0 / dist; 
        if (inputs.mouse.w==1) { force *= -1.0; }
        
        random = rand(seed);
        seed = random.seed;
        let dr = random.value - 0.2;
        var push = normalize(delta) * force * dr * 2;
        
        let maxPush = 10.0;
        if (length(push) > maxPush) {
            push = normalize(push) * maxPush;
        }

        var offset = vec2i(push);
        coords = clamp(coords + offset, vec2i(0), vec2i(inputs.size) - vec2i(1));
        winnerColor = textureLoad(feedbackTexture, coords, 0);
      }

      var output: FragmentOutput;
      output.color = winnerColor;
      output.nextSeed = f32(seed);
      return output;
    }

  fn rand(seed: u32) -> RandOutput {
    var state = seed * 747796405u + 2891336453u;
    var word: u32 = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    let next_seed = (word >> 22u) ^ word;
    
    let val = f32(next_seed) / 4294967295.0;
    return RandOutput(next_seed, val);
  }
  `;

}
