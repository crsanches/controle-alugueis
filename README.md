# Controle de Aluguéis

Projeto Next.js (App Router) + Firebase/Firestore para gestão de contratos, boletos e pagamentos de aluguel. Substitui a aplicação Node.js/Express/MySQL original.

## O que já está pronto

- Layout base com sidebar de navegação
- Painel (`/`) com resumo: contratos ativos, receita mensal, boletos pendentes/atrasados
- CRUD completo (criar/editar/excluir) de contratos, boletos, inquilinos e imóveis
- Geração de recibo em PDF a partir de um boleto (botão "Baixar recibo em PDF" na edição, ou "PDF" na listagem)
- Envio assistido por WhatsApp: gera uma imagem do recibo, copia para a área de transferência e abre a conversa do inquilino já com uma mensagem pronta — você só precisa colar (Ctrl+V / Cmd+V) e enviar
- Sistema de tipos TypeScript alinhado ao schema migrado (`lib/types.ts`)
- Identidade visual própria: paleta "livro-razão" (tinta/papel/terracota), tipografia Fraunces + Inter + IBM Plex Mono

## Sobre o envio por WhatsApp

O WhatsApp não permite anexar um arquivo automaticamente via link — isso vale até para a API oficial da Meta, que exige aprovação de negócio e templates de mensagem pré-aprovados. Por isso, o fluxo aqui automatiza tudo que dá pra automatizar sem essa burocracia (ou custo de serviços terceiros):

1. Busca os dados do inquilino e do imóvel
2. Gera uma imagem do recibo (visual, não o PDF)
3. Copia essa imagem para a área de transferência do seu computador
4. Abre o WhatsApp Web (ou app) já na conversa do inquilino certo, com uma mensagem de texto pronta (valor, mês de referência, vencimento)

Você só precisa colar a imagem (`Ctrl+V` no Windows, `Cmd+V` no Mac) na conversa e enviar os dois. Se o navegador não suportar copiar imagem para a área de transferência (acontece em alguns casos), a imagem é baixada automaticamente para você anexar manualmente.

**Importante:** isso exige que o telefone do inquilino esteja preenchido no cadastro (`/tenants`).

## Antes de gerar o primeiro recibo

Edite `lib/landlordConfig.ts` com seus dados reais (nome, CPF, chave PIX) — esses dados aparecem no recibo como "Locador". Sem isso, o PDF sai com os valores de exemplo.

## O que falta (próximas etapas)

- Salvar o PDF/imagem gerados no Firebase Storage (hoje eles só são copiados/baixados no navegador, não ficam arquivados)
- Autenticação (mesmo sendo monousuário, recomendo adicionar antes de ir pra produção)
- Regras de segurança do Firestore (hoje abertas, propositalmente, para desenvolvimento)

## Como rodar localmente

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar o Firebase

No [Console do Firebase](https://console.firebase.google.com), dentro do projeto que você já criou para migração:

1. Vá em ⚙️ **Configurações do projeto**
2. Na aba **Geral**, role até "Seus apps" → clique no ícone **Web** (`</>`) para registrar um app web (se ainda não tiver um)
3. Copie os valores do objeto `firebaseConfig`

```bash
cp .env.local.example .env.local
```

Preencha o `.env.local` com os valores copiados.

### 3. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Regras do Firestore (importante)

Por enquanto, use regras abertas para desenvolvimento (você mencionou que é monousuário):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Configure isso em: Firebase Console → Firestore Database → Regras.

**Atenção:** isso deixa o banco de dados acessível por qualquer pessoa que descobrir a URL do projeto. Funciona para desenvolvimento/uso pessoal, mas antes de divulgar a aplicação publicamente (ou se ela crescer para múltiplos usuários), essas regras precisam ser fechadas com autenticação.

## Deploy na Vercel

```bash
npm i -g vercel
vercel
```

Na primeira execução, a Vercel vai pedir para conectar o projeto. Configure as mesmas variáveis de ambiente do `.env.local` no painel da Vercel (Project Settings → Environment Variables) antes do deploy de produção.
