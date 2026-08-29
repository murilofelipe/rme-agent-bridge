# Contrato de mensagens da ponte

Especificação em prosa para quem implementa o **lado Lua** (dentro do RME). A
fonte executável é `types.ts` + `validate.ts`; este documento e aquele código
são mantidos juntos.

- **Transporte-agnóstico.** O mesmo payload JSON vale por HTTP (ADR 0001) ou por
  troca de arquivo. Nada de URL, header ou nome de arquivo aqui.
- **Versão suportada:** `1`. Payload com outra versão é rejeitado.

## `BridgeRequest` — script Lua → agente

```jsonc
{
  "version": 1,
  "instruction": "texto em linguagem natural digitado pelo humano",
  "selection": {
    "min": { "x": 1000, "y": 1000, "z": 7 },   // inclusivo
    "max": { "x": 1003, "y": 1003, "z": 7 }     // inclusivo
  },
  "tiles": [
    // contexto compacto de cada tile da seleção
    { "x": 1000, "y": 1000, "z": 7, "ground": 4526 },
    { "x": 1001, "y": 1000, "z": 7, "ground": 4526, "flags": 2 },
    { "x": 1002, "y": 1000, "z": 7, "ground": 351, "items": [1740] }
  ]
}
```

- **`tiles` é ESPARSO.** Inclui só os tiles da seleção que têm conteúdo
  (ground diferente de `0`, ou algum item, ou alguma flag). Um tile da seleção
  **ausente** de `tiles` significa **vazio** (sem ground, sem item). O lado Lua
  não enumera a seleção inteira.
- `tiles[].ground` — id do ground; `0` = sem ground.
- `tiles[].items` — **omitir** quando vazio.
- `tiles[].flags` — bitfield, **omitir** quando `0`. `1` = tem parede, `2` = tem borda.
- Todo tile em `tiles` tem que cair dentro de `selection`.
- `selection` não pode passar de **4096 tiles** (`MAX_SELECTION_TILES`).

## `BridgeResponse` — agente → script Lua

```jsonc
{
  "version": 1,
  "autoBorder": true,        // opcional; ausente = true
  "operations": [            // lista ORDENADA; vazia = nada a fazer
    { "type": "setGround",  "x": 1000, "y": 1000, "z": 7, "id": 4526 },
    { "type": "addItem",    "x": 1002, "y": 1002, "z": 7, "id": 2782, "count": 1 },
    { "type": "removeItem", "x": 1002, "y": 1002, "z": 7, "id": 1740 },
    { "type": "applyBrush", "x": 1003, "y": 1003, "z": 7, "name": "grass" },
    { "type": "borderize",  "x": 1001, "y": 1001, "z": 7 }
  ]
}
```

- `type` só pode ser um dos cinco acima.
- `id` (em `setGround`/`addItem`/`removeItem`): inteiro `>= 1`.
- `count` (em `addItem`): opcional, inteiro `>= 1`.
- `name` (em `applyBrush`): string não vazia.
- Toda operação tem que cair dentro de `selection` do request.
- A ordem das operações é respeitada na aplicação (ex.: ground antes de item).
- Um `borderize` explícito é **independente** do passe de auto-contorno do fim
  da transação (`autoBorder`). Use-o para bordear um tile no meio da sequência;
  não precisa desligar `autoBorder` por causa dele.

## O que a validação NÃO cobre

Existência de id de item/ground e existência do tile no mapa. Isso é checado na
aplicação (script Lua, dentro de `app.transaction`) e um erro causa rollback da
transação inteira.
