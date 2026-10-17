# Amostras reais da API JSON do INE

Recolhidas em **17 de outubro de 2026**. São respostas literais da API pública que permitem auditar os snapshots iniciais. A aplicação consulta o INE em direto quando o utilizador pede uma observação em falta.

| Ficheiro | Pedido de origem | Valor observado |
|---|---|---|
| `population-2025-portimao.json` | [INE `0012918`, Portimão, 2025](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0012918&Dim1=S7A2025&Dim2=1500811&Dim3=T&Dim4=T&lang=PT) | 78 125 pessoas |
| `rent-2025-portimao.json` | [INE `0014711`, Portimão, 2025](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0014711&Dim1=S7A2025&Dim2=1500811&Dim3=2&lang=PT) | 11,36 €/m² |
| `rent-2021-2025-four-municipalities.json` | [INE `0014711`, quatro municípios, 2021–2025](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0014711&Dim1=S7A2021,S7A2022,S7A2023,S7A2024,S7A2025&Dim2=1500801,1500805,1500807,1500811&Dim3=2&lang=PT) | Resposta literal a um único pedido: 20 valores, 5 anos × 4 municípios; extração `2026-10-17T12:39:31.296+01:00` |
| `rent-2025-lagos.json` | [INE `0014711`, Lagos, 2025](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0014711&Dim1=S7A2025&Dim2=1500807&Dim3=2&lang=PT) | 12,34 €/m² |
| `rent-2025-faro-normalized.json` | [INE `0014711`, Faro, 2025](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0014711&Dim1=S7A2025&Dim2=1500805&Dim3=2&lang=PT) | 9,67 €/m²; observação normalizada e guardada pela app, não resposta literal |
| `unemployment-2026-q2-algarve.json` | [INE `0012136`, Algarve, 2.º trimestre 2026](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0012136&Dim1=S5A20262&Dim2=15&Dim3=T&lang=PT) | 4,2%, com aviso de qualidade da fonte |
| `unemployment-algarve-2024q3-2026q2.json` | [INE `0012136`, Algarve, 2024T3–2026T2](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0012136&Dim1=S5A20243,S5A20244,S5A20251,S5A20252,S5A20253,S5A20254,S5A20261,S5A20262&Dim2=15&Dim3=T&lang=PT) | Oito trimestres num pedido; 2025T2=4,5% § e 2026T2=4,2% § |
| `wage-2021-2024-portimao.json` | [INE `0012653`, Portimão, 2021 e 2024](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0012653&Dim1=S7A2021,S7A2024&Dim2=1500811&Dim3=T&lang=PT) | 1 102,08 € e 1 294,27 €; ganho médio mensal de trabalhadores por conta de outrem a tempo completo com remuneração completa |
| `guests-2022-2025-portimao.json` | [INE `0013312`, Portimão, 2022–2025](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0013312&Dim1=S7A2022,S7A2023,S7A2024,S7A2025&Dim2=1500811&lang=PT) | 9,2; 9,4; 9,9; 8,4 hóspedes por habitante |
| `waste-2021-2024-portimao.json` | [INE `0012765`, Portimão, 2021–2024](https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=0012765&Dim1=S7A2021,S7A2022,S7A2023,S7A2024&Dim2=1500811&lang=PT) | 689; 698; 638; 643 kg/hab. de resíduos urbanos recolhidos |

Os ficheiros `metadata-0012653.json`, `metadata-0013312.json` e `metadata-0012765.json` preservam as respostas literais dos [metadados do INE](https://www.ine.pt/ine/json_indicador/pindicaMeta.jsp) consultados com `varcd=<ID>&lang=PT`. Confirmam o município de Portimão e, no caso do ganho médio, a categoria `Dim3=T` (nível de educação Total). Estas três séries novas foram obtidas com **um pedido de dados por indicador**.

Fonte: Instituto Nacional de Estatística (INE). Atribuição e condições de reutilização da fonte aplicam-se separadamente da licença MIT do código.
