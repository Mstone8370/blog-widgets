# blog-widgets

## 시각화 목록

### PBR · BRDF
- [D GGX](https://mstone8370.github.io/blog-widgets/Graphics/PBR/D_GGX_Visualizer.html)
- [F Schlick](https://mstone8370.github.io/blog-widgets/Graphics/PBR/F_Schlick_Visualizer.html)
- [G Smith](https://mstone8370.github.io/blog-widgets/Graphics/PBR/G_Smith_Visualizer.html)
- [V Smith](https://mstone8370.github.io/blog-widgets/Graphics/PBR/V_Smith_Visualizer.html)
- [Specular BRDF](https://mstone8370.github.io/blog-widgets/Graphics/PBR/Specular_BRDF_Visualizer.html)
- [Diffuse](https://mstone8370.github.io/blog-widgets/Graphics/PBR/Diffuse_Visualizer.html)
- [PBR](https://mstone8370.github.io/blog-widgets/Graphics/PBR/PBR_Visualizer.html)
- [Single Scattering](https://mstone8370.github.io/blog-widgets/Graphics/PBR/Single_Scattering_Visualizer.html)
- [Multi Scattering](https://mstone8370.github.io/blog-widgets/Graphics/PBR/Multi_Scattering_Visualizer.html)

### Diffuse IBL
- [Cosine Sampling](https://mstone8370.github.io/blog-widgets/Graphics/DiffuseIBL/Cosine_Sampling_Visualizer.html)
- [Irradiance Map](https://mstone8370.github.io/blog-widgets/Graphics/DiffuseIBL/Irradiance_Sphere_Visualizer.html)
- [SH Irradiance](https://mstone8370.github.io/blog-widgets/Graphics/DiffuseIBL/SH_Irradiance_Visualizer.html)

### 구면 조화 (SH)
- [SH 밴드별 주파수](https://mstone8370.github.io/blog-widgets/Graphics/SH/SH_Bands_Visualizer.html)
- [SH 밴드 분해 · 누적 (단일 구)](https://mstone8370.github.io/blog-widgets/Graphics/SH/SH_Reconstruction_Visualizer.html)

### Specular IBL · 샘플링
- [Monte Carlo](https://mstone8370.github.io/blog-widgets/Graphics/SpecularIBL/Monte_Carlo_Visualizer.html)
- [Monte Carlo (Hammersley)](https://mstone8370.github.io/blog-widgets/Graphics/SpecularIBL/Monte_Carlo_Hammersley_Visualizer.html)
- [GGX Sampling](https://mstone8370.github.io/blog-widgets/Graphics/SpecularIBL/GGX_Sampling_Visualizer.html)
- [BRDF Lobe](https://mstone8370.github.io/blog-widgets/Graphics/SpecularIBL/BRDF_Lobe_Visualizer.html)
- [Specular IBL](https://mstone8370.github.io/blog-widgets/Graphics/SpecularIBL/Specular_IBL_Visualizer.html)

## 사용 방법
 
각 위젯은 독립적인 HTML 파일이며, GitHub Pages로 호스팅되어 `iframe`을 통해 블로그에 임베드됨

1. 블로그 글의 HTML블럭을 원하는 위치에 삽입
2. `src`와 `aspect-ratio`만 위젯에 맞게 조정

```html
<div style="max-width: 500px; aspect-ratio: 5/6; margin: 0 auto;">
  <iframe src="https://mstone8370.github.io/blog-widgets/경로/위젯파일.html" frameborder="0">
  </iframe>
</div>
<style>
  div[style*="aspect-ratio"] iframe { display: block; width: 100% !important; height: 100% !important; border: 0; }
</style>
```

- `max-width`: 위젯의 최대 가로 폭. 블로그 본문 너비에 맞춰 조정
- `aspect-ratio`: 위젯의 가로:세로 비율. 위젯별로 다름

## 위젯 제작 가이드
 
새 위젯을 만들 때는 다음 구조를 따름
 
### HTML 구조
 
```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    background: #fdfdfd;
  }
 
  .my-widget {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }
 
  .my-widget .canvas-wrap {
    flex: 1;
    min-height: 0;
  }
 
  .my-widget canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
 
  .my-widget .controls {
    flex-shrink: 0;
  }
</style>
</head>
<body>
  <div class="my-widget">
    <div class="canvas-wrap">
      <canvas></canvas>
    </div>
    <div class="controls">
      <!-- 슬라이더 등 -->
    </div>
  </div>
  <script>
    // 위젯 로직
  </script>
</body>
</html>
```
 
### 핵심 원칙
 
- `html`, `body`, 최상위 컨테이너가 모두 `height: 100%`
- 최상위 컨테이너는 flex column으로 캔버스가 `flex: 1`, 컨트롤은 고정 높이
- 캔버스의 width/height를 `canvas.clientWidth/clientHeight`로 측정해서 실제 픽셀 크기로 설정
- `ResizeObserver`로 iframe 크기 변화에 자동 반응

이렇게 하면 위젯이 어떤 환경(블로그, 데스크탑, 모바일)에서든 부모가 정한 iframe 영역을 정확히 채우며, 임베드 코드는 모든 위젯에 동일하게 사용됨
