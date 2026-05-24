/**
 * Política de Privacidade — LGPD (Lei 13.709/2018) compliant.
 * Última revisão: 2026-05-21.
 */
export const metadata = {
  title: 'Política de Privacidade · 2º Ofício de Registro Civil',
  description:
    'Como o 2º Ofício de Registro Civil de Jaboatão coleta, usa, armazena e protege seus dados pessoais conforme a LGPD.',
};

const LAST_UPDATED = '21 de maio de 2026';
const VERSION = '1.0';

export default function PrivacidadePage() {
  return (
    <>
      <h1>Política de Privacidade</h1>
      <p className="text-muted-foreground text-sm">
        Versão {VERSION} · Última atualização: {LAST_UPDATED}
      </p>

      <p>
        O <strong>2º Ofício de Registro Civil das Pessoas Naturais e Notas de Jaboatão dos
        Guararapes/PE</strong> ("nós", "Serventia") leva a sério a privacidade dos cidadãos que
        utilizam nossos serviços. Esta política descreve como tratamos seus dados pessoais, em
        conformidade com a <strong>Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD)</strong>{' '}
        e com a regulamentação do Conselho Nacional de Justiça (CNJ).
      </p>

      <h2>1. Quem somos (Controlador dos dados)</h2>
      <ul>
        <li><strong>Razão social:</strong> 2º Ofício de Registro Civil das Pessoas Naturais e Notas de Jaboatão dos Guararapes</li>
        <li><strong>Oficial Titular:</strong> Taisa Tiaen</li>
        <li><strong>Endereço:</strong> Rua Santo Amaro, 54 — Centro, Jaboatão dos Guararapes/PE</li>
        <li><strong>Telefone:</strong> (81) 3316-2908 · <strong>WhatsApp oficial:</strong> +55 81 3016-2808</li>
        <li><strong>Encarregado pelo Tratamento de Dados (DPO):</strong> dpo@cartoriocentrojaboatao.com.br</li>
      </ul>

      <h2>2. Quais dados coletamos</h2>
      <h3>2.1 Dados que você nos fornece</h3>
      <ul>
        <li><strong>Identificação civil:</strong> nome completo, CPF, RG, data de nascimento, naturalidade, filiação</li>
        <li><strong>Contato:</strong> telefone, e-mail, endereço residencial</li>
        <li><strong>Estado civil:</strong> certidões anteriores, situação conjugal</li>
        <li><strong>Documentos:</strong> cópias de RG, CPF, comprovantes de residência, fotos enviadas</li>
        <li><strong>Comunicações:</strong> mensagens trocadas via WhatsApp, e-mail e telefone</li>
      </ul>

      <h3>2.2 Dados coletados automaticamente</h3>
      <ul>
        <li>Data e hora das interações</li>
        <li>Conteúdo de áudios, imagens e documentos enviados em mensagens</li>
        <li>Endereço IP e tipo de dispositivo (quando acessa nosso site)</li>
        <li>Cookies estritamente necessários para funcionamento</li>
      </ul>

      <h3>2.3 Dados de terceiros</h3>
      <p>
        Em casos de óbito, reconhecimento de paternidade, casamento e outros atos que envolvem
        terceiros, podemos coletar dados de pessoas mencionadas nos documentos apresentados (ex.:
        nome de pais, cônjuge, testemunhas).
      </p>

      <h2>3. Por que coletamos (bases legais — LGPD Art. 7º)</h2>
      <ul>
        <li><strong>Obrigação legal e regulatória</strong> (Art. 7º, II): cumprimento da Lei dos Registros Públicos (Lei 6.015/73), Provimentos do CNJ e Corregedoria-PE</li>
        <li><strong>Execução de serviço público</strong> (Art. 7º, III): emissão de certidões, habilitações, registros</li>
        <li><strong>Execução de contrato</strong> (Art. 7º, V): quando você solicita um serviço pago</li>
        <li><strong>Consentimento</strong> (Art. 7º, I): para envio de comunicações não obrigatórias (pesquisa de satisfação, lembretes de retirada)</li>
        <li><strong>Legítimo interesse</strong> (Art. 7º, IX): prevenção a fraudes e melhoria da qualidade do atendimento</li>
        <li><strong>Tutela da saúde</strong> (Art. 11, II, "f"): registro de óbitos por questão de saúde pública</li>
      </ul>

      <h2>4. Como usamos seus dados</h2>
      <ul>
        <li>Lavrar e arquivar registros públicos (nascimento, casamento, óbito, averbações)</li>
        <li>Emitir certidões, segundas vias e inteiro teor</li>
        <li>Processar habilitações de casamento e união estável</li>
        <li>Apostilar documentos para uso internacional</li>
        <li>Responder às suas dúvidas pelo WhatsApp, e-mail ou telefone</li>
        <li>Enviar avisos sobre documentos prontos para retirada</li>
        <li>Comunicar agendamentos e confirmações</li>
        <li>Cumprir ordens judiciais e requisições de autoridades</li>
        <li>Cumprir obrigações fiscais e contábeis</li>
      </ul>

      <h2>5. Com quem compartilhamos</h2>
      <p>Compartilhamos seus dados apenas quando estritamente necessário e legalmente permitido:</p>
      <ul>
        <li><strong>Poder Judiciário</strong> e <strong>Corregedoria-Geral de Justiça de PE</strong> — quando requisitado por ordem judicial ou administrativa</li>
        <li><strong>Outros cartórios</strong> via CRC (Central de Registro Civil) — para emissão de certidões nacionais</li>
        <li><strong>Receita Federal e órgãos públicos</strong> — para cumprimento de obrigações legais (CCS, CAFIR, SIRC)</li>
        <li><strong>Meta Platforms (WhatsApp Business)</strong> — exclusivamente para entrega das mensagens trocadas pelo nosso canal oficial</li>
        <li><strong>Operadores tecnológicos contratados</strong> — provedor de hospedagem, sob contrato de operador com obrigações de sigilo</li>
      </ul>
      <p>
        <strong>Não vendemos, alugamos ou cedemos seus dados pessoais para fins comerciais</strong>, em
        nenhuma hipótese.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li><strong>Registros públicos (livros):</strong> permanente, por força de lei (Lei 6.015/73)</li>
        <li><strong>Mensagens de atendimento (WhatsApp/e-mail):</strong> 5 anos (CDC) ou enquanto durar o atendimento</li>
        <li><strong>Cópias de documentos pessoais:</strong> apenas o tempo necessário para conclusão do ato</li>
        <li><strong>Dados de pagamento:</strong> 5 anos (legislação fiscal)</li>
        <li><strong>Logs de auditoria e segurança:</strong> 5 anos</li>
        <li><strong>Dados anônimos/agregados:</strong> tempo indefinido (sem identificação pessoal)</li>
      </ul>

      <h2>7. Como protegemos seus dados</h2>
      <ul>
        <li>Criptografia AES-256 em dados sensíveis no banco</li>
        <li>Conexão HTTPS (TLS 1.3) em todas as comunicações com nossos sistemas</li>
        <li>Controle de acesso por perfil (apenas pessoal autorizado vê dados sensíveis)</li>
        <li>Autenticação multifator (2FA) para acesso administrativo</li>
        <li>Auditoria detalhada de todos os acessos (quem viu, quando, o quê)</li>
        <li>Backups diários criptografados em múltiplas localizações (incluindo cópia física offline)</li>
        <li>Treinamento contínuo da equipe sobre privacidade e LGPD</li>
        <li>Política de senha forte e rotação periódica</li>
      </ul>

      <h2>8. Seus direitos (LGPD Art. 18)</h2>
      <p>Como titular de dados pessoais, você tem direito a:</p>
      <ol>
        <li><strong>Confirmação</strong> da existência de tratamento</li>
        <li><strong>Acesso</strong> aos dados que temos sobre você</li>
        <li><strong>Correção</strong> de dados incompletos, inexatos ou desatualizados</li>
        <li><strong>Anonimização, bloqueio ou eliminação</strong> de dados desnecessários ou tratados em desconformidade com a LGPD</li>
        <li><strong>Portabilidade</strong> dos seus dados</li>
        <li><strong>Eliminação</strong> dos dados tratados com seu consentimento (exceto registros públicos obrigatórios)</li>
        <li><strong>Informação</strong> sobre com quem compartilhamos seus dados</li>
        <li><strong>Revogação do consentimento</strong> a qualquer momento</li>
        <li><strong>Oposição</strong> ao tratamento</li>
      </ol>
      <p>
        Para exercer qualquer desses direitos, acesse{' '}
        <a href="/exclusao-de-dados" className="underline">/exclusao-de-dados</a> ou escreva
        para <a href="mailto:dpo@cartoriocentrojaboatao.com.br" className="underline">dpo@cartoriocentrojaboatao.com.br</a>.
        Respondemos em até <strong>15 dias úteis</strong>.
      </p>

      <h2>9. Limitações ao direito de exclusão</h2>
      <p>
        Por se tratar de Cartório de Registro Civil, <strong>registros públicos lavrados nos livros
        (nascimento, casamento, óbito, averbações) são imutáveis e perpétuos por força de lei</strong>
        — não podem ser excluídos, ainda que solicitado. Eventuais correções dependem de retificação
        administrativa ou judicial.
      </p>
      <p>
        A exclusão se aplica a: cópias de mensagens, documentos de apoio (RG, CPF, comprovantes),
        e-mails, registros de atendimento — desde que não estejam vinculados a um processo em
        andamento ou a obrigação legal de guarda.
      </p>

      <h2>10. Cookies</h2>
      <p>
        Utilizamos apenas <strong>cookies estritamente necessários</strong> para funcionamento
        básico do sistema (sessão, segurança, preferência de idioma). Não usamos cookies de
        rastreamento, publicidade ou analytics de terceiros sem seu consentimento.
      </p>

      <h2>11. Transferência internacional de dados</h2>
      <p>
        Algumas integrações (WhatsApp Cloud da Meta) podem transferir dados para servidores fora
        do Brasil. Essas transferências obedecem às hipóteses do Art. 33 da LGPD (cumprimento de
        obrigação legal e execução de contrato com você).
      </p>

      <h2>12. Crianças e adolescentes</h2>
      <p>
        Tratamos dados de crianças e adolescentes apenas para finalidades civis legítimas
        (registro de nascimento, reconhecimento de paternidade, etc.), sempre com o consentimento
        ou representação dos pais/responsáveis, em melhor interesse do menor (Art. 14 LGPD).
      </p>

      <h2>13. Incidentes de segurança</h2>
      <p>
        Em caso de incidente que possa acarretar risco ou dano relevante aos titulares,
        comunicaremos os afetados e a Autoridade Nacional de Proteção de Dados (ANPD) em prazo
        razoável, conforme o Art. 48 da LGPD.
      </p>

      <h2>14. Alterações nesta política</h2>
      <p>
        Esta política pode ser atualizada a qualquer momento. A versão vigente sempre estará
        publicada nesta página, com data da última atualização indicada no topo. Mudanças
        relevantes serão comunicadas pelos canais habituais.
      </p>

      <h2>15. Reclamações à ANPD</h2>
      <p>
        Se entender que seus direitos não foram atendidos, você pode reclamar diretamente à{' '}
        <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong>:{' '}
        <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="underline">
          gov.br/anpd
        </a>
        .
      </p>

      <h2>16. Contato</h2>
      <p>
        Para dúvidas sobre privacidade e proteção de dados, contate nosso Encarregado (DPO):
      </p>
      <ul>
        <li><strong>E-mail:</strong> dpo@cartoriocentrojaboatao.com.br</li>
        <li><strong>Telefone:</strong> (81) 3316-2908 — solicitar setor de Privacidade</li>
        <li><strong>Endereço:</strong> Rua Santo Amaro, 54 — Centro, Jaboatão dos Guararapes/PE</li>
      </ul>
    </>
  );
}
