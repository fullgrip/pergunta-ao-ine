# Pergunta ao INE

**Dados públicos, explicados em português de Portugal. Um projeto [FullGrip.ai](https://fullgrip.ai/), com código MIT.**

**Projeto independente, não afiliado ao Instituto Nacional de Estatística.** Os dados oficiais são atribuídos ao INE; a marca, os textos explicativos e o desenho da aplicação são independentes.

A aplicação combina observações da API pública do Instituto Nacional de Estatística (INE) com explicações do Gemma 4. O modelo interpreta perguntas e adapta o texto; os valores, períodos, cálculos e fontes vêm de observações oficiais verificadas pelo servidor. O utilizador pode mudar entre seis tons sem consultar novamente o INE.

## O que já funciona

- **Perguntar:** 14 temas oficiais, cada um confirmado na API do INE: rendas de novos contratos, preço mediano de venda das casas, avaliação bancária, número de casas (parque habitacional), casas novas concluídas, população residente, índice de envelhecimento, taxa de natalidade, taxa de criminalidade, poder de compra per capita, ganho médio mensal, taxa de desemprego do Algarve, hóspedes por habitante e resíduos urbanos por habitante. Quando a pergunta sai destes temas, a app procura no catálogo municipal do INE (744 conceitos, `data/ine-catalogo-municipal.json`) e diz que indicadores existem sobre o assunto, em vez de responder outra coisa. O parser valida indicador, território e período. Uma menção explícita a um município na pergunta prevalece sobre a seleção guardada; nomes ambíguos pedem esclarecimento. A pergunta e a resposta direta surgem antes da explicação e do gráfico; tabelas, cálculos e fontes ficam em “Ver mais dados”, “Como foi calculado?” e “Prova-me isso”. O carregamento mostra etapas emitidas pelo servidor.
- **Perguntas de escolha pessoal:** “Qual a melhor cidade para viver?” abre uma orientação sobre os critérios disponíveis e a Batalha de Cidades. A aplicação não apresenta a renda como medida única de qualidade de vida.
- **Explicar de seis formas:** Direto, Jornalista, Professor, Investigador, Executivo e Sarcástico. A mesma evidência pode aparecer em dois estilos lado a lado. As ações Simplificar, Aprofundar, Resumir e Dar contexto reutilizam tons e dados já guardados. É possível exportar o texto do tom escolhido; a preferência de tom é guardada durante a sessão.
- **Catálogo nacional:** pesquisa local por nome, acentos ou código INE em 308 municípios do continente, Açores e Madeira. A [lista versionada](./data/municipios.json) foi extraída de uma [resposta oficial do indicador 0012918](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0012918&Dim1=S7A2024&lang=PT). O seletor guarda a preferência entre páginas. A lista de códigos não garante que cada indicador tenha valores publicados em cada município: a disponibilidade é confirmada pela observação devolvida pelo INE.
- **Raio-X nacional:** qualquer município pode ser aberto por slug ou código oficial. Portimão tem cinco séries oficiais incluídas; Faro, Lagos e Albufeira têm a série verificada de rendas de 2021 a 2025. Noutros municípios, o Raio-X consulta apenas rendas e população ao abrir; “Atualizar do INE” procura os restantes temas. Períodos, unidades e fontes acompanham os valores.
- **Batalha de Cidades:** compara dois a quatro municípios escolhidos, com URL partilhável. Permite rendas, população, ganho médio, hóspedes por habitante e resíduos urbanos por habitante. O ranking exige valores do mesmo indicador, unidade e período para todos. Um pedido explícito ao INE recolhe os valores em falta em lote e guarda snapshots locais; ausências continuam identificadas.
- **Descobertas:** permite escolher um município do catálogo; usa snapshot ou um pedido anual em lote para encontrar uma variação verificável. A explicação do Gemma recebe apenas evidências validadas, e o utilizador pode abrir cálculo e fonte. A história original de Portimão continua disponível.
- **Algarve à vista:** fotografias locais das quatro cidades, com crédito e licença na própria imagem, e um SVG com a costa simplificada e marcadores nas coordenadas geográficas indicadas. A identidade usa verde pinho, azul Atlântico e ocre das falésias, com modo escuro.

Os snapshots incluídos foram recolhidos em **17 de outubro de 2026**. A aplicação distingue visualmente snapshot de consulta em direto e permite atualizar os dados quando solicitado. A série de renda das quatro cidades veio de **um único pedido** ao INE com 20 observações; o desemprego do Algarve inclui oito trimestres obtidos num pedido em lote. Municípios adicionados à comparação só geram um pedido quando o utilizador pede os valores em falta. O mapa de perguntas e o orçamento de pedidos estão em [QUESTION_MAP.md](./QUESTION_MAP.md).

## Instalar e abrir

Requisitos: Node.js compatível com Next.js 16, acesso ao INE para atualizações e Gemma 4 no Ollama local ou uma chave da Gemini API.

```bash
cp .env.example .env.local
npm install
npm run dev -- -p 3001 -H 127.0.0.1
```

Abre `http://127.0.0.1:3001/`. O projeto pode usar outra porta; `3001` é a porta da pré-visualização nesta sessão.

Por omissão, `OLLAMA_BASE_URL=http://127.0.0.1:11434` e `OLLAMA_MODEL=gemma4:e4b`. Para usar a Gemini API, define `PROVIDER=gemini` e `GEMINI_API_KEY` no servidor. O modelo configurado por omissão nessa via é `gemma-4-26b-a4b-it`. Se a chamada à Gemini API falhar, o servidor tenta o Ollama e o selo da resposta mostra o fornecedor que efetivamente respondeu. Uma chave não está incluída no projeto; a via Gemini só fica comprovada após uma chamada real com chave válida. Consulta [Google: Gemma pela Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api).

Ao publicar, define também `NEXT_PUBLIC_SITE_URL` com o endereço público da app para gerar URLs corretos na imagem Open Graph. Em desenvolvimento, a base é `http://localhost:3001`.

## Fluxo e garantia factual

```text
pergunta → Gemma interpreta → catálogo e datas validados → snapshot ou INE
         → observações normalizadas → cálculos determinísticos
         → evidência temporária imutável → Gemma adapta o texto ao tom
         → validação factual → resposta, gráfico, tabela e fontes
```

O servidor constrói uma conclusão factual (`headline`) estável entre os tons e anexa uma frase quantitativa às explicações, com unidade e período. O Gemma gera a parte qualitativa de `summary`; `caveat` explicita a limitação principal. Texto livre que introduza números, troque mediana por média ou acrescente causas sem prova é rejeitado; há uma regeneração controlada e depois um template seguro, identificado na interface como tal. Os seis tons recebem a mesma evidência. A troca de tom usa `POST /api/explain` com um `analysisId`, nunca valores enviados pelo browser.

O desemprego trimestral do Algarve é sazonal: quando há série suficiente, a comparação usa o **mesmo trimestre do ano anterior** e mede a diferença em pontos percentuais. Os sinais de qualidade do INE são preservados. Rendas são medianas de **novos contratos em €/m²**, e não o custo médio de todos os contratos existentes. O ganho médio mensal cobre trabalhadores por conta de outrem a tempo completo com remuneração completa; comparar taxas de crescimento de ganho e renda não permite calcular a fração do salário gasta em habitação.

## API e ficheiros

| Endpoint | Função |
| --- | --- |
| `POST /api/ask` | `{ "question": "…", "municipalityId": "…" }`; a menção explícita na pergunta tem prioridade. Devolve dados, cálculos, fontes, explicação direta e `analysisId`; com `Accept: text/event-stream`, emite etapas reais e o resultado final |
| `POST /api/explain` | `{ "analysisId": "…", "tone": "journalist" }`; reescreve apenas a explicação |
| `GET /api/city/{municipio}` | Raio-X por slug ou código oficial; usa snapshot quando existe e consulta dados mínimos do INE caso contrário. `?live=1` pede os temas restantes |
| `GET /api/compare?indicator=rendas&territories=1500811,1120303` | Alinha observações verificadas e calcula ranking sem consultar o INE |
| `POST /api/compare` | Consulta e guarda valores municipais em falta num pedido em lote, quando pedido pelo utilizador |
| `POST /api/discoveries` | `{ "municipalityId": "…" }`; descoberta com cálculo e prova, usando snapshot ou um pedido INE em lote |
| `GET /api/story` | História estatística determinística |

As respostas literais oficiais estão em [fixtures/ine](./fixtures/ine), os snapshots normalizados em [data/snapshots](./data/snapshots), e os códigos de municípios em [data/municipios.json](./data/municipios.json). O catálogo pode ser reconstruído com `node scripts/update-municipalities.mjs`; a atualização deve ser revista antes de entrar numa release. O código da integração INE está em `lib/ine`; o cálculo e as explicações em `lib/analysis.ts` e `lib/explanation`. O [plano técnico](./PLAN.md) inclui os diagramas e a sequência de lançamento.

`npm run lint`, `npm test` e `npm run build` validam tipos, testes e build. A cache de evidências do `analysisId` dura 30 minutos e reside na memória de **um processo Node**. Para alojamento com várias instâncias ou funções isoladas, usa uma cache partilhada antes de prometer mudança de tom sem perder a análise. Os valores recolhidos pela Batalha são guardados em `.data/ine-snapshots/` por omissão; em alojamento, aponta `INE_SNAPSHOT_DIR` para um volume persistente. As consultas livres e o Raio-X também usam uma cache temporária em memória para evitar pedidos repetidos durante a demo.

## Licenças e atribuição

O **código** tem [licença MIT](./LICENSE) e autoria FullGrip.ai. Os **dados e metadados** são do INE e mantêm as respetivas condições de reutilização e atribuição. O **modelo Gemma 4** conserva os seus próprios termos; a licença MIT do código não os substitui. As explicações são identificadas como geradas por IA, e nunca atribuídas ao INE.

Na interface, a assinatura FullGrip.ai aparece apenas no rodapé.

As fotografias são provenientes do Wikimedia Commons e mantêm as respetivas licenças CC BY-SA. Os autores, as licenças e as páginas originais estão em [data/creditos.json](./data/creditos.json); a cópia local foi redimensionada e convertida para WebP. As fontes Inter e Inter Tight são distribuídas localmente sob SIL Open Font License, com os textos em [app/fonts](./app/fonts). O código das fotografias, os ficheiros das fontes e os dados oficiais continuam sujeitos às suas licenças próprias.
