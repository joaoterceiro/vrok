/**
 * Página de Exclusão de Dados (LGPD Art. 18 + Política da Meta).
 *
 * A Meta exige que toda app WhatsApp/Instagram tenha uma URL pública
 * de Data Deletion. Esta página atende a essa exigência e ao Art. 18 LGPD.
 *
 * URL pública: /exclusao-de-dados
 */
import { LgpdRequestForm } from './_form';

export const metadata = {
  title: 'Exclusão de Dados Pessoais · 2º Ofício de Registro Civil',
  description:
    'Solicite acesso, correção, anonimização ou exclusão dos seus dados pessoais tratados pelo 2º Ofício de Registro Civil de Jaboatão.',
};

export default function ExclusaoPage() {
  return (
    <>
      <h1>Exclusão e Gestão de Dados Pessoais</h1>

      <p>
        Esta página permite que você exerça os direitos previstos no{' '}
        <strong>Art. 18 da Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)</strong> em
        relação aos dados pessoais tratados pelo{' '}
        <strong>2º Ofício de Registro Civil das Pessoas Naturais e Notas de Jaboatão dos Guararapes</strong>.
      </p>

      <h2>O que você pode solicitar</h2>
      <ol>
        <li><strong>Acesso</strong> aos seus dados pessoais que armazenamos</li>
        <li><strong>Correção</strong> de dados incompletos, inexatos ou desatualizados</li>
        <li>
          <strong>Anonimização ou bloqueio</strong> de dados desnecessários ou tratados em
          desconformidade com a LGPD
        </li>
        <li>
          <strong>Eliminação (exclusão)</strong> dos dados tratados com seu consentimento — exceto
          registros públicos obrigatórios
        </li>
        <li><strong>Portabilidade</strong> dos seus dados em formato estruturado</li>
        <li><strong>Informação</strong> sobre com quem compartilhamos seus dados</li>
        <li><strong>Revogação de consentimento</strong> para tratamentos baseados em consentimento</li>
      </ol>

      <h2>O que NÃO pode ser excluído (por força de lei)</h2>
      <p>
        Por se tratar de Cartório de Registro Civil, alguns dados são <strong>imutáveis e
        perpétuos</strong>, conforme a Lei de Registros Públicos (Lei 6.015/73):
      </p>
      <ul>
        <li>Registros lavrados em livros oficiais: nascimento, casamento, óbito, averbações</li>
        <li>Atos notariais já praticados: escrituras, procurações, reconhecimentos de firma</li>
        <li>Dados exigidos pela Receita Federal, INSS, CRC e Corregedoria-CNJ</li>
        <li>Documentação fiscal e contábil pelo prazo legal (5 anos)</li>
        <li>Audit logs do sistema (5 anos)</li>
      </ul>
      <p>
        Esses registros podem ser <strong>retificados</strong> via procedimento administrativo ou
        judicial específico, mas não excluídos.
      </p>

      <h2>O que PODE ser excluído mediante solicitação</h2>
      <ul>
        <li>Mensagens trocadas com nossa equipe (WhatsApp, e-mail, telefone)</li>
        <li>Documentos auxiliares enviados (cópias de RG, CPF, comprovantes de residência) após conclusão do ato</li>
        <li>Dados de contato para comunicações comerciais (lembretes, pesquisas)</li>
        <li>Sua conta no canal digital de atendimento</li>
        <li>Inscrição em campanhas e listas de transmissão</li>
      </ul>

      <h2>Como solicitar</h2>

      <h3>Opção 1 — Formulário online (recomendado)</h3>
      <p>Preencha o formulário abaixo. Resposta em até 15 dias úteis.</p>

      <LgpdRequestForm />

      <h3>Opção 2 — E-mail direto ao DPO</h3>
      <p>
        Envie e-mail para <a href="mailto:dpo@cartoriocentrojaboatao.com.br" className="underline">
          dpo@cartoriocentrojaboatao.com.br
        </a> com as seguintes informações:
      </p>
      <ul>
        <li>Nome completo</li>
        <li>CPF</li>
        <li>Telefone (preferencialmente o utilizado em nossos atendimentos)</li>
        <li>Tipo de solicitação (acesso, correção, exclusão, portabilidade, etc.)</li>
        <li>Detalhes da solicitação</li>
        <li>Anexar foto de documento oficial com foto (para verificação de identidade)</li>
      </ul>

      <h3>Opção 3 — Presencial no cartório</h3>
      <p>
        Compareça pessoalmente em <strong>Rua Santo Amaro, 54 — Centro, Jaboatão dos
        Guararapes/PE</strong> (Seg-Sex 8h às 16h) com RG ou CPF original. Não há custo.
      </p>

      <h2>Como confirmamos sua identidade</h2>
      <p>
        Para proteger seus dados, exigimos verificação de identidade antes de atender qualquer
        solicitação. Aceitamos:
      </p>
      <ul>
        <li>Cópia de documento oficial com foto (RG, CNH, passaporte)</li>
        <li>Confirmação por telefone do número usado em atendimentos anteriores</li>
        <li>Comparecimento presencial com documento original</li>
        <li>Em casos especiais: vídeo-chamada agendada</li>
      </ul>

      <h2>Prazos</h2>
      <ul>
        <li><strong>Confirmação de recebimento:</strong> imediato (automático)</li>
        <li><strong>Resposta formal:</strong> até 15 dias úteis</li>
        <li><strong>Execução da exclusão</strong> (quando aplicável): até 30 dias úteis após verificação</li>
        <li><strong>Casos complexos:</strong> podem ser prorrogados, com aviso prévio fundamentado</li>
      </ul>

      <h2>Custo</h2>
      <p>
        O exercício de direitos LGPD é <strong>totalmente gratuito</strong>. Não cobramos pela
        análise ou execução de pedidos.
      </p>

      <h2>Se você não estiver satisfeito com nossa resposta</h2>
      <p>Você pode escalar para:</p>
      <ul>
        <li>
          <strong>Autoridade Nacional de Proteção de Dados (ANPD):</strong>{' '}
          <a href="https://www.gov.br/anpd/pt-br" target="_blank" rel="noopener noreferrer" className="underline">
            gov.br/anpd/pt-br
          </a>
        </li>
        <li>
          <strong>Corregedoria-Geral de Justiça de PE:</strong>{' '}
          <a href="https://www.tjpe.jus.br" target="_blank" rel="noopener noreferrer" className="underline">
            tjpe.jus.br
          </a>
        </li>
        <li>
          <strong>Defensoria Pública de PE:</strong>{' '}
          <a href="https://www.defensoria.pe.def.br" target="_blank" rel="noopener noreferrer" className="underline">
            defensoria.pe.def.br
          </a>{' '}
          (atendimento gratuito)
        </li>
      </ul>

      <h2>Encarregado pelo Tratamento de Dados (DPO)</h2>
      <ul>
        <li><strong>E-mail:</strong> dpo@cartoriocentrojaboatao.com.br</li>
        <li><strong>Telefone:</strong> (81) 3316-2908</li>
        <li><strong>Endereço:</strong> Rua Santo Amaro, 54 — Centro, Jaboatão dos Guararapes/PE</li>
      </ul>
    </>
  );
}
