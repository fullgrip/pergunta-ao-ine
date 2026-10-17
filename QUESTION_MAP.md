# Mapa de perguntas e orçamento de pedidos

Uma pergunta livre admite **um indicador**, um ou dois territórios permitidos e até dois anos explícitos. Os códigos e dimensões são escolhidos no servidor e validados depois da interpretação do Gemma. O catálogo local inclui 308 municípios oficiais; um código válido não implica que o INE tenha publicado valor para todos os indicadores e períodos.

## Perguntas prontas e cobertura guardada

| Pergunta ou ação | Indicador, território e período | Leitura responsável | Novos pedidos ao INE |
| --- | --- | --- | ---: |
| Como evoluíram as rendas em Portimão? | `0014711`, Portimão, 2021–2025 | 7,09 → 11,36 €/m²; mediana de novos contratos, +60,2% | 0 |
| As rendas eram mais altas em Lagos ou Portimão em 2025? | `0014711`, ambos, 2025 | Lagos 12,34; Portimão 11,36 €/m², mesmo indicador e ano | 0 |
| Batalha das quatro cidades | `0014711`, quatro municípios, 2021–2025 | Ranking apenas do mesmo período; cinco anos e 20 valores guardados | 0 |
| Qual era a população de Portimão em 2025? | `0012918`, Portimão, 2025 | 78 125 pessoas; um ponto não define tendência | 0 |
| Como evoluiu a taxa de desemprego no Algarve? | `0012136`, Algarve, 2024T3–2026T2 | Oito trimestres; 2025T2 4,5% vs 2026T2 4,2%, diferença −0,3 p.p.; avisos § | 0 |
| Qual era a taxa no 2.º trimestre de 2026? | `0012136`, Algarve, 2026T2 | 4,2% §; isoladamente não prova tendência | 0 |
| Abrir o Raio-X de Portimão | `0014711`, `0012918`, `0012653`, `0013312`, `0012765` | Cinco séries oficiais com períodos e unidades próprios | 0 |
| Descobrir algo surpreendente | `0014711`, quatro cidades, 2021–2025 | Maior aumento percentual comprovado: Lagos +62,8%; prova dos quatro pares | 0 |
| Conta a história de Portimão | Rendas e ganho médio mensal em 2021–2024 | Comparar crescimento das duas medidas; não inferir esforço salarial | 0 |
| Mudar tom ou comparar estilos | `analysisId` já guardado | Mesmo conjunto de observações, cálculos, fontes e limitações | 0 |
| Como evoluiu a população em Braga? | `0012918`, Braga, 2021–2025 | Resposta nacional on demand, sem extrapolação | 1 pedido em lote na primeira consulta |
| Batalha Portimão vs Braga em 2025 | `0014711`, dois municípios, 2025 | Valor em falta consultado num pedido explícito e guardado; ranking só com ambos | 1 pedido em lote na primeira consulta |
| Descoberta em município sem snapshot | `0014711`, cinco anos | Maior variação comprovada entre observações publicadas | 1 pedido em lote na primeira consulta |

**Dados e fonte:** respostas literais em `fixtures/ine/`; snapshots normalizados em `data/snapshots/`. A renda é mediana de **novos contratos**, não de todos os arrendamentos. Os valores de desemprego com § têm aviso de qualidade do INE. O ganho médio mensal cobre trabalhadores por conta de outrem a tempo completo com remuneração completa.

## Quando a aplicação precisa do INE

| Caso | Política de pedidos |
| --- | --- |
| Ano ou município fora do snapshot, mas dentro do catálogo nacional | Um pedido em lote por indicador com os períodos e municípios pedidos. Só usar a resposta se os códigos coincidirem. |
| Comparação de população com Faro, Lagos ou Albufeira | Um pedido em lote para os municípios selecionados; sem valor completo não há ranking. |
| “Atualizar do INE” no Raio-X | Um lote por indicador selecionado; até cinco pedidos para as cinco séries. O snapshot anterior continua visível durante a espera. |
| Valores municipais em falta na Batalha | Um pedido em lote após clique explícito, com todos os municípios em falta no mesmo indicador/período; guardar observações normalizadas em `.data/ine-snapshots/`. |
| Falha/limite de taxa do INE | Mostrar snapshot apenas se cobrir todos os períodos pedidos. Caso contrário explicar a ausência; nunca interpolar ou mostrar zero por falta. |

O cliente mantém fila de pedidos, timeout, cache temporária e pausa perante `429`. Abrir o Raio-X de um município sem snapshot consulta rendas e população; clicar em “Atualizar” pode consultar mais três indicadores. Reabrir a Batalha ou trocar o tom não gera pedidos ocultos ao INE.

## Fora do parser de perguntas livres nesta versão

- “Qual a melhor cidade para viver no Algarve?” recebe uma orientação com ligação à comparação de rendas; os indicadores atuais não sustentam uma recomendação geral de qualidade de vida.
- `0012653` ganho, `0013312` hóspedes e `0012765` resíduos têm interpretação livre e comparação municipal, sujeitos a disponibilidade de valores na API do INE.
- “Porque subiram as rendas?” exige evidência causal que estas séries não fornecem.
- “Quanto do salário vai para a renda?” exigiria área da habitação, composição do agregado e medidas compatíveis; os dados atuais permitem apenas comparar **taxas de crescimento** de renda por m² e ganho médio.
- “Número de desempregados no Algarve” não é a taxa de desemprego `0012136`.
- Pedidos de 2026T3/T4 não são aceites até o INE publicar esses trimestres no catálogo.

A assinatura do projeto é [FullGrip.ai](https://fullgrip.ai/). O código é MIT; os dados mantêm atribuição ao INE e as condições próprias da fonte.
