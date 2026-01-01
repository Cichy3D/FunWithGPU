import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';

@Component({
  selector: 'app-noise-with-mouse',
  imports: [],
  templateUrl: './noise-with-mouse.html',
  styleUrl: './noise-with-mouse.scss',
})
export class NoiseWithMouse  implements OnInit, OnDestroy {

  @ViewChild('gpuCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private pipeline!: GPURenderPipeline;
  private uniformBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;
  
  // Dane do wysłania do GPU (mouse.x, mouse.y, dummy, dummy, size.x, size.y, frame, dummy)
  private uniformData = new Float32Array(8); 
  private frameCount = 0;
  private resizeObserver?: ResizeObserver;
  private animationId: any;

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

    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: this.device, format });

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
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-strip' },
    });

    // 3. Powiązanie danych (Bind Group)
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });

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

  render = () => {
    const canvas = this.canvasRef.nativeElement;
    
    // Aktualizacja danych
    this.uniformData[4] = canvas.width;
    this.uniformData[5] = canvas.height;
    this.uniformData[6] = this.frameCount++;
    this.uniformData[7] = window.devicePixelRatio || 1;
    
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData);

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(4); // Rysujemy prostokąt z 4 wierzchołków
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
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

      // Kluczowy moment: musimy poinformować WebGPU o nowym rozmiarze tekstur
      this.context.configure({
        device: this.device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: 'premultiplied', // lub 'opaque'
      });
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

  @vertex
  fn vs_main(@builtin(vertex_index) id: u32) -> @builtin(position) vec4f {
    var pos = array<vec2f, 4>(
      vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(1, 1)
    );
    return vec4f(pos[id], 0.0, 1.0);
  }

  @fragment
  fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {

    var i: f32 = rand_from_u32(u32(inputs.frame));
    var j: f32 = rand(pos.yx/vec2f(100.0,100.0) + vec2f(sin(f32(i)), sin(f32(i))));
    var p: vec2f = pos.xy+vec2f(100.0, 100.0);

    var noise: vec3f = vec3f(
      rand_from_u32(u32(p.x*j+p.y*j)),
      rand_from_u32(u32(p.x*j+p.y*j/i)),
      rand_from_u32(u32(p.y*j+p.x*j/i))
    );

    let small: f32 = min(inputs.size.x,inputs.size.y);
		let d: vec4f = inputs.mouse*inputs.zoom - pos;
		let r: f32 = length(d.xy) / small;
		
    return vec4f(noise - sqrt(r/4), 1.0);
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
