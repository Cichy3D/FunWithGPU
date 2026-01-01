import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';

@Component({
  selector: 'app-noise-differential',
  imports: [],
  templateUrl: './noise-differential.html',
  styleUrl: './noise-differential.scss',
})
export class NoiseDifferential implements OnInit, OnDestroy {

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
  private textureViews: GPUTextureView[] = [];
  private pingPongIndex = 0;
  private textureFormat: GPUTextureFormat = 'rgba8unorm';
  
  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    this.uniformData[0] = event.clientX;
    this.uniformData[1] = event.clientY;
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
        targets: [{ format: this.textureFormat }],
      },
      primitive: { topology: 'triangle-strip' },
    });
    
    this.initTextures();
    
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
  
  private initTextures() {
    const width = this.canvasRef.nativeElement.width;
    const height = this.canvasRef.nativeElement.height;
    
    // Czyścimy stare tekstury jeśli istnieją
    this.textures.forEach(t => t.destroy());
    
    for (let i = 0; i < 2; i++) {
      this.textures[i] = this.device.createTexture({
        size: [width, height],
        format: this.textureFormat,
        usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.textureViews[i] = this.textures[i].createView();
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
        { binding: 1, resource: this.textureViews[backBufferIndex] }, // Czytamy z A
      ],
    });

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.textureViews[frontBufferIndex],
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
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

      //musimy poinformować WebGPU o nowym rozmiarze tekstur
      this.context.configure({
        device: this.device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: 'premultiplied', // lub 'opaque'
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
      });

      this.initTextures();
    }
}

  noiseShader: string = `
  struct Inputs {
    mouse: vec4f,
    size: vec2f,
    frame: f32,
    zoom: f32
  };

  @group(0) @binding(0) var<uniform> inputs: Inputs;
  @group(0) @binding(1) var feedbackTexture: texture_2d<f32>;

  @vertex
  fn vs_main(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
    var pos = array<vec2f, 4>(
      vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1)
    );
    return vec4f(pos[id], 0.0, 1.0);
  }

  @fragment
  fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let coords = vec2i(pos.xy);
    let prevColor = textureLoad(feedbackTexture, coords, 0);

    var i: f32 = rand_from_u32(u32(inputs.frame));
    var j: f32 = rand(pos.yx/vec2f(100.0,100.0) + vec2f(sin(f32(i))));
    var p: vec2f = pos.xy+vec2f(100.0, 100.0);
    var k: f32 = rand(pos.yx / vec2f(inputs.frame%1000));

    var noise: vec4f = vec4f(
      rand_from_u32(u32(p.x*j+p.y*j)),
      rand_from_u32(u32(p.x*j+p.y*j/i)),
      rand_from_u32(u32(p.y*j+p.x*j/i)),
      1.0
    );

    let small: f32 = min(inputs.size.x,inputs.size.y);
		let d: vec4f = inputs.mouse*inputs.zoom - pos;
		let r: f32 = length(d.xy) / small;
    let mouseMult = 1.0-clamp(r*r*16/inputs.zoom,0.0,1.0);

    let withMouse = vec4f(mix(noise.rgb, vec3f(mouseMult), 0.5), 1.0);
    let withMouseMix = mix(noise, withMouse, 0.9);

    var doReplace = 0.001;
    if (k<0.01) {
      doReplace = 1.0;
    }

    return clamp(mix(prevColor, withMouseMix, doReplace)*1.01, vec4f(0.0), vec4f(1.0));
  }
    
  // funkcje pomocnicze
  fn hash(u: u32) -> u32 {
    var x = u;
    x = ((x >> 16) ^ x) * 0x45d9f3bu;
    x = ((x >> 16) ^ x) * 0x45d9f3bu;
    x = (x >> 16) ^ x;
    return x;
  }

  fn rand_from_u32(u: u32) -> f32 {
    return f32(hash(u)) / f32(0xffffffffu);
  }

  fn rand(n: vec2f) -> f32 {
    return fract(sin(dot(n, vec2f(12.9898, 4.1414))) * 43758.5453);
  }
  `;


}
