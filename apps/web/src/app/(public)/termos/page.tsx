/**
 * Termos de Uso — canal oficial WhatsApp e atendimento digital.
 */
export const metadata = {
  title: 'Termos de Uso · 2º Ofício de Registro Civil',
  description:
    'Regras de uso do canal oficial WhatsApp e atendimento digital do 2º Ofício de Registro Civil de Jaboatão dos Guararapes.',
};

const LAST_UPDATED = '21 de maio de 2026';
const VERSION = '1.0';

export default function TermosPage() {
  return (
    <>
      <h1>Termos de Uso</h1>
      <p className="text-muted-foreground text-sm">
        Versão {VERSION} · Última atualização: {LAST_UPDATED}
      </p>

      <p>
        Estes Termos de Uso regulam a utilização do <strong>canal oficial WhatsApp Business
        (+55 81 3016-2808)</strong> e demais ferramentas de atendimento digital do{' '}
        <strong>2º Ofício de Registro Civil das Pessoas Naturais e Notas de Jaboatão dos Guararapes/PE</strong>
        ("Serventia").
      </p>

      <p>
        Ao iniciar uma conversa ou utilizar qualquer um dos nossos canais digitais, você concorda
        integralmente com estes Termos e com nossa{' '}
        <a href="/privacidade" className="underline">Política de Privacidade</a>.
      </p>

      <h2>1. Identificação do Cartório</h2>
      <ul>
        <li><strong>Serventia:</strong> 2º Ofício de Registro Civil das Pessoas Naturais e Notas de Jaboatão dos Guararapes</li>
        <li><strong>Oficial Titular:</strong> Taisa Tiaen</li>
        <li><strong>Endereço:</strong> Rua Santo Amaro, 54 — Centro, Jaboatão dos Guararapes/PE</li>
        <li><strong>Horário:</strong> Segunda a Sexta, 8h às 16h</li>
        <li><strong>Site oficial:</strong> cartoriocentrojaboatao.com.br</li>
        <li><strong>Fundada em:</strong> 15 de outubro de 1888</li>
      </ul>

      <h2>2. Natureza do serviço</h2>
      <p>
        Somos uma serventia extrajudicial delegada do Poder Público, na forma do Art. 236 da
        Constituição Federal e da Lei 8.935/94. Atendemos:
      </p>
      <ul>
        <li>Registro Civil das Pessoas Naturais (RCPN): nascimentos, casamentos, óbitos, averbações, retificações</li>
        <li>Tabelionato de Notas: reconhecimentos de firma, autenticações, procurações</li>
        <li>Apostilamento de Haia (para uso internacional de documentos)</li>
      </ul>
      <p>
        Os atos praticados têm <strong>fé pública</strong> e seguem a Lei 6.015/73 e provimentos
        da Corregedoria-Geral de Justiça de PE.
      </p>

      <h2>3. Uso aceitável dos canais digitais</h2>
      <p>Ao usar nosso WhatsApp ou outros canais digitais, você concorda em:</p>
      <ul>
        <li>Fornecer informações verdadeiras e atualizadas</li>
        <li>Usar linguagem respeitosa com nossa equipe</li>
        <li>Não enviar conteúdo ilícito, ofensivo, discriminatório ou que viole direitos de terceiros</li>
        <li>Não enviar SPAM ou mensagens automatizadas em massa</li>
        <li>Não tentar fraudar, falsificar ou induzir nossa equipe a erro</li>
        <li>Respeitar a legislação brasileira</li>
      </ul>

      <h2>4. O que NÃO fazemos pelo WhatsApp</h2>
      <p>Por segurança e para sua proteção, nosso canal digital <strong>não realiza</strong>:</p>
      <ul>
        <li>Aceitação de documentos originais (apenas presencial)</li>
        <li>Celebração de cerimônias civis (presencial obrigatório)</li>
        <li>Lavratura de habilitações sem comparecimento dos noivos</li>
        <li>Reconhecimento de paternidade sem presença do reconhecedor</li>
        <li>Solicitação de senhas, códigos bancários ou dados de cartão de crédito</li>
        <li>Negociação de valores fora da tabela de emolumentos da TJPE</li>
      </ul>
      <p>
        <strong>Atenção a golpes:</strong> nunca solicitamos PIX para "antecipação" ou
        "liberação" de processo sem confirmação prévia do valor com nosso atendente. Em dúvida,
        ligue para <strong>(81) 3316-2908</strong>.
      </p>

      <h2>5. Valores e pagamento</h2>
      <p>
        Os valores dos atos são fixados pelo <strong>Tribunal de Justiça de Pernambuco (TJPE)</strong>{' '}
        e atualizados anualmente. A tabela vigente está disponível em{' '}
        <a href="https://cartoriocentrojaboatao.com.br/emolumentos" className="underline">
          cartoriocentrojaboatao.com.br/emolumentos
        </a>
        . Não cobramos qualquer valor além do tabelado, exceto custos eventuais de envio
        (Sedex/correios) quando solicitado pelo cidadão.
      </p>
      <p>
        <strong>Gratuidades garantidas por lei:</strong> 1ª via de certidão de nascimento, 1ª via
        de certidão de óbito, celebração de casamento de pessoas pobres (mediante declaração de
        hipossuficiência).
      </p>

      <h2>6. Prazos de atendimento</h2>
      <ul>
        <li><strong>WhatsApp dentro do expediente</strong> (Seg-Sex 8h-16h): resposta em até 2 horas úteis</li>
        <li><strong>Fora do expediente:</strong> resposta no próximo dia útil</li>
        <li><strong>Emissão de certidão 2ª via:</strong> mesmo dia até 5 dias úteis (após pagamento)</li>
        <li><strong>Habilitação para casamento:</strong> aproximadamente 15 dias</li>
        <li><strong>Apostilamento:</strong> até 5 dias úteis</li>
        <li><strong>Busca em livros antigos:</strong> até 30 dias</li>
      </ul>

      <h2>7. Propriedade intelectual</h2>
      <p>
        Todo o conteúdo do nosso site, redes sociais e materiais de atendimento (textos, logo,
        identidade visual) são de propriedade do Cartório. Reprodução não autorizada para fins
        comerciais é proibida.
      </p>

      <h2>8. Limitação de responsabilidade</h2>
      <p>
        Atuamos com a máxima diligência, mas não nos responsabilizamos por:
      </p>
      <ul>
        <li>Erros causados por dados incorretos fornecidos pelo cidadão</li>
        <li>Atrasos decorrentes de força maior (queda de luz, internet, sistemas externos)</li>
        <li>Recusa de aceitação dos nossos documentos por terceiros (consulados, órgãos estrangeiros, etc.)</li>
        <li>Conteúdo de mensagens enviadas por canais não oficiais ou falsificados</li>
      </ul>

      <h2>9. Cancelamento e direito de arrependimento</h2>
      <p>
        Para serviços contratados e ainda não executados, o cidadão pode solicitar cancelamento e
        reembolso. Para serviços já lavrados em livro (atos perfeitos), não há reembolso por
        natureza do registro público.
      </p>
      <p>
        O direito de arrependimento de 7 dias (Art. 49 CDC) aplica-se apenas a contratações feitas
        à distância, e não se estende a serviços públicos delegados já executados.
      </p>

      <h2>10. Suspensão ou bloqueio de acesso</h2>
      <p>Podemos bloquear seu acesso aos canais digitais em casos de:</p>
      <ul>
        <li>Violação destes Termos</li>
        <li>Tentativa de fraude</li>
        <li>Uso ofensivo ou ameaçador contra nossa equipe</li>
        <li>Envio massivo de mensagens automatizadas</li>
        <li>Disseminação de informações falsas sobre o Cartório</li>
      </ul>
      <p>
        O atendimento presencial e o exercício de direitos cidadãos permanecem garantidos pela via
        normal.
      </p>

      <h2>11. Reclamações e ouvidoria</h2>
      <p>Caso queira registrar elogio, sugestão ou reclamação:</p>
      <ul>
        <li><strong>Ouvidoria interna:</strong> ouvidoria@cartoriocentrojaboatao.com.br</li>
        <li>
          <strong>Corregedoria-Geral de Justiça de PE:</strong>{' '}
          <a href="https://www.tjpe.jus.br" target="_blank" rel="noopener noreferrer" className="underline">
            tjpe.jus.br
          </a>
        </li>
      </ul>

      <h2>12. Foro</h2>
      <p>
        Fica eleito o foro da Comarca de Jaboatão dos Guararapes/PE para dirimir quaisquer
        controvérsias decorrentes destes Termos, com renúncia a qualquer outro, por mais
        privilegiado que seja.
      </p>

      <h2>13. Alterações</h2>
      <p>
        Estes Termos podem ser atualizados a qualquer momento. A versão vigente sempre estará
        disponível nesta página. Continuar utilizando nossos canais após alterações significa
        concordância com a nova versão.
      </p>

      <h2>14. Contato</h2>
      <ul>
        <li><strong>Atendimento:</strong> (81) 3316-2908</li>
        <li><strong>WhatsApp oficial:</strong> +55 81 3016-2808</li>
        <li><strong>E-mail:</strong> contato@cartoriocentrojaboatao.com.br</li>
        <li><strong>Privacidade/LGPD:</strong> dpo@cartoriocentrojaboatao.com.br</li>
      </ul>
    </>
  );
}
