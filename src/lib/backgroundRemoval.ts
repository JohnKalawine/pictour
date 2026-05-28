export type BackgroundRemovalMode = 'CHROMA_COLOR' | 'AI_PERSON';

export const backgroundRemovalModes: Array<{
  id: BackgroundRemovalMode;
  label: string;
  description: string;
  available: boolean;
}> = [
  {
    id: 'CHROMA_COLOR',
    label: 'Chroma verde atual',
    description: 'Rápido, local e bom para fundo verde bem iluminado.',
    available: true
  },
  {
    id: 'AI_PERSON',
    label: 'Recorte por IA de pessoa',
    description: 'Experimental: tenta usar motor local/offline quando a dependência @imgly/background-removal estiver instalada.',
    available: true
  }
];

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Falha ao converter recorte IA.'));
    reader.readAsDataURL(blob);
  });
}

export async function removeBackgroundWithAi(imageDataUrl: string): Promise<string> {
  try {
    const moduleName = '@imgly/background-removal';
    const mod = await import(/* @vite-ignore */ moduleName);
    const removeBackground = mod.removeBackground || mod.default;
    if (typeof removeBackground !== 'function') {
      throw new Error('A dependência @imgly/background-removal não exportou removeBackground.');
    }
    const result = await removeBackground(imageDataUrl);
    if (typeof result === 'string') return result;
    if (result instanceof Blob) return blobToDataUrl(result);
    if (result?.blob instanceof Blob) return blobToDataUrl(result.blob);
    throw new Error('Formato de retorno do recorte IA não reconhecido.');
  } catch (error) {
    console.warn(error);
    throw new Error('Motor IA não disponível ainda. Rode npm install com a dependência opcional @imgly/background-removal ou continue usando o chroma verde.');
  }
}
