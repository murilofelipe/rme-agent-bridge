# CONTEXT — RME Agent Bridge

Entendimento compartilhado do projeto, construído em sessão de grilling
(2026-08-29). Documenta o **o quê**; o **como** (protocolo, libs) fica para ADRs
conforme cada peça for decidida.

## O que o projeto é

**A ponte é o produto.** O RME Agent Bridge dá a *qualquer* agente uma forma de
enxergar e manipular um mapa aberto no Remere's Map Editor (RME), o editor de
mapas de OpenTibia. O agente — Claude Code, um modelo local, um script — é
plugável e está fora do escopo do projeto.

Analogia: é para o RME o que a extensão de navegador do Claude Code é para um
site. O editor expõe **comandos** ("coloque grama em tal quadrado", "rode o
auto-contorno nessa área", "me diga o que tem aqui", "selecione essa região") e
o agente os chama direto — sem simular mouse, sem screenshot.

Existe um único **contrato de comandos** por baixo. As formas de consumo (SDK,
servidor MCP, plugin) são embrulhos finos sobre esse contrato.

## Fora de escopo (é responsabilidade do agente, não da ponte)

- Entender linguagem natural. Traduzir "faz um lago sombrio no canto nordeste"
  em ações no mapa é trabalho do agente.
- Ter modelo de IA próprio.
- Geração procedural.
- Visão computacional (interpretar uma imagem de referência).

A ponte só precisa expor o mapa de um jeito que um LLM consiga raciocinar em
cima: consultar estado de uma área, listar pincéis/itens, colocar/remover,
selecionar região, rodar auto-contorno, conferir resultado.

## Casos de uso alvo

1. **Co-edição ao vivo** — uma pessoa trabalha no RME normalmente; um agente
   trabalha no mesmo mapa ao lado, guiado por chat.
2. **Reproduzir uma referência** — dado um mapa de outro game ou uma imagem, o
   agente monta aquilo no editor para um servidor de jogo. Problema difícil, mas
   do agente; a ponte só oferece colocar coisas e conferir.

## Decisões da co-edição ao vivo

| Tema | Decisão |
| --- | --- |
| Interação | Linguagem natural via chat. Terminal no MVP; chat dentro do RME depois. |
| Operação do agente | Uma operação = uma transação atômica = **um** passo de undo (não N tiles). |
| Concorrência | Enquanto o agente mexe numa área, o RME **bloqueia fisicamente** o input do humano naquela área até a operação terminar. |
| Visual do bloqueio | Retângulo semitransparente colorido sobre a área + label curto ("agente: desenhando lago…"). Some no commit. |
| Sentido da comunicação | Bidirecional: agente manda comandos; editor manda eventos (o que o humano fez, status de bloqueio, pedido de revisão). |
| Modos | (1) humano observa e pede pelo chat; (2) humano seleciona uma área e aciona "revisar seleção" ou "continuar daqui" por item de menu no RME. Modo 2 é sob demanda, nunca contínuo. |
| Auto-contorno | Automático ao fim de cada transação, com flag para desligar; também disponível como comando avulso. |

## Alvo técnico

- Editor: `opentibiabr/remeres-map-editor` (fork mantido pela comunidade).
- Client/itens: Tibia recente (protocolo 13.x). Um alvo só — ADR quando fixado.
- Transporte: **HTTP** — o script Lua do editor faz um round-trip por
  acionamento para uma ponte local (ADR 0001). Sem canal residente: `app.sleep`
  congela a GUI e `app.events` é código morto na v4.0. A ponte escuta num IP
  de LAN ou alias de `/etc/hosts` — o `isUrlSafe` do editor bloqueia
  `localhost`/`127.`/`[::1]`.

## Pendências de design (próximas sessões)

- Forma exata das mensagens do contrato (primitivas + transação vs. intenções
  de alto nível). Inclinação: primitivas (`setTile`/`getTile`/`autoborder`/
  `lock` + `begin`/`commit`), mantendo o lado do RME burro e estável.
- Onde vive a matemática de geometria (rasterizar um círculo, etc.) — no
  embrulho/SDK, não no RME.
- Autenticação do canal local.
- Qual a primeira fatia demonstrável de ponta a ponta.
