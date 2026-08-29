# RME-Bridge: Autonomous Map Generation Architecture

## 1. Visão Geral do Projeto
O objetivo deste projeto é criar uma pipeline de comunicação em tempo real entre um agente LLM (Antigravity/Gemini Pro) e o Remere's Map Editor (RME). O sistema contorna a ineficiência da automação visual (GUI/Mouse) estabelecendo uma arquitetura nativa baseada em código. A IA atuará como arquiteta, enviando instruções espaciais através de uma SDK em Node.js/TypeScript, que se comunicará via requisições assíncronas com uma API embutida no core do RME em C++. O agente rodará em um ambiente isolado via Docker, garantindo escalabilidade e estabilidade.

---

## 2. Fases de Desenvolvimento

### Fase 1: Modificação do Core do RME (C++)
A primeira etapa exige modificar o código-fonte do RME para que ele atue como um servidor escutando comandos externos.

*   **Objetivo:** Injetar um servidor HTTP/WebSocket ultraleve (ex: `cpp-httplib` ou `Boost.Beast`) na thread principal ou em uma thread paralela com mutex lock no *canvas* do RME.
*   **Endpoints Necessários (MVP):**
    *   `POST /api/v1/tile`: Recebe `{x, y, z, id}` para desenhar um item ou piso.
    *   `POST /api/v1/brush`: Recebe `{startX, startY, endX, endY, z, brush_type}` para desenhar áreas (ex: floresta, montanha).
    *   `POST /api/v1/autoborder`: Aciona o algoritmo interno de atualização de bordas da área modificada.
*   **Desafio Técnico:** Garantir que as chamadas da API externa sincronizem com o ciclo de renderização OpenGL do RME sem causar *crash* ou *segmentation fault*.

### Fase 2: Construção da SDK Middleware (TypeScript / Node.js)
A inteligência do agente não deve lidar diretamente com chamadas HTTP e IDs crus do Tibia. Precisamos de uma biblioteca intermediária.

*   **Objetivo:** Criar um pacote em TypeScript que abstraia os endpoints em C++ para uma sintaxe orientada a objetos fluida.
*   **Estrutura de Classes:**
    *   `RMESession`: Gerencia a conexão WebSocket/HTTP com o RME local.
    *   `MapBuilder`: Contém os métodos lógicos de construção.
*   **Exemplo de Implementação:**
    ```typescript
    export class MapBuilder {
        constructor(private session: RMESession) {}

        async drawLake(centerX: number, centerY: number, radius: number, z: number) {
            // Lógica para calcular a matriz circular
            // Chamada para this.session.sendBrushCmd(...)
            // Chamada para this.session.applyAutoBorder()
        }
    }
    ```

### Fase 3: Ambiente do Agente e Framework (Python + Docker)
O agente Antigravity processará as instruções do Product Owner (PO) e escreverá a lógica espacial que consome a SDK.

*   **Objetivo:** Isolar o cérebro da operação. O framework em Python processa o prompt (PO), gera a matriz de pensamento, e executa os comandos.
*   **Containerização (Docker):** 
    *   O agente e a SDK Node.js rodarão dentro de um container Docker para isolamento de dependências e previsibilidade do ambiente.
    *   O container se comunicará com o *host* (onde o RME em C++ está aberto rodando no desktop) expondo e consumindo a porta da API local (ex: `host.docker.internal:8080`).
*   **Fluxo do Agente:** 
    1. Lê a especificação do mapa.
    2. Importa módulos pré-treinados de arquitetura de OTServ (ex: tamanho padrão de passagens, zonas de proteção).
    3. Gera um script consumindo a SDK TypeScript para orquestrar o desenho em tempo real.

### Fase 4: Integração de Geração Procedural
Com a ponte de comunicação estabelecida, o agente começará a gerar estruturas padronizadas.

*   **Objetivo:** Treinar o modelo a utilizar a SDK para geometrias complexas.
*   **Rotinas Iniciais (Blueprints):**
    *   **Geração de Cavernas (Cave System):** Algoritmos de *Cellular Automata* executados no Node.js para gerar cavernas orgânicas de *earth* e *rock*.
    *   **Geração de Natureza (Sprawling):** Algoritmos de ruído (Perlin Noise) para distribuir árvores de forma natural, sem parecer um padrão de tabuleiro.

---

## 3. Matriz de Tarefas para Início Imediato

1.  [ ] Clonar repositório mais estável do Remere's Map Editor.
2.  [ ] Configurar ambiente de compilação C++ (CMake) localmente.
3.  [ ] Integrar `cpp-httplib` e fazer o build inicial rodar.
4.  [ ] Escrever script de teste em Node.js (via Terminal) batendo no localhost do RME aberto para tentar adicionar 1 *tile* de grama (ID 4526).
5.  [ ] Configurar o `Dockerfile` do Antigravity para suportar execução de scripts Node.js internamente.