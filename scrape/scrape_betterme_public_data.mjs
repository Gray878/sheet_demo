import { writeFile, mkdir } from "node:fs/promises";

const TARGET_URL =
  "https://betterme-pilates.com/first-page-brand-palette?flow=2117";
const ORIGIN = "https://betterme-pilates.com";
const IMAGE_BASE =
  "https://image-service.betterme.world/57355568-8766-44a5-a327-6266bc0080f7/image/upload";
const OUT_DIR = "betterme_scrape";

async function getText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; public-page-data-extractor/1.0)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} ${response.statusText}: ${url}`);
  }

  return response.text();
}

function extractNextData(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );

  if (!match) {
    throw new Error("Could not find __NEXT_DATA__ in the page HTML.");
  }

  return JSON.parse(match[1]);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function absoluteUrl(value) {
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${ORIGIN}${value}`;
  return value;
}

function imageUrl(imageId, width = 960) {
  if (!imageId) return null;
  return `${IMAGE_BASE}/c_fill%2Cw_${width}/f_webp/q_auto:eco/fl_lossy/c_fit/${imageId}`;
}

function pickQuestion(step, index) {
  if (step.type !== "QUESTION") {
    return {
      index,
      id: step.id,
      type: step.type,
      title: step.title ?? step.pageTitle ?? null,
      analyticsEvent: step.analyticsEvent ?? null,
      automationId: step.automationId ?? null,
      innerType: step.innerType ?? null,
      url: step.url ?? null,
      image: step.image ?? null,
      imageUrl: imageUrl(step.image),
      text: step.text ?? null,
      reviews: step.reviews ?? null,
    };
  }

  return {
    index,
    id: step.id,
    questionId: step.questionId,
    type: step.type,
    title: step.title ?? null,
    description: step.description ?? null,
    analyticsEvent: step.analyticsEvent ?? null,
    questionType: step.questionType ?? null,
    questionStyle: step.questionStyle ?? null,
    questionImage: step.questionImage ?? null,
    questionImageUrl: imageUrl(step.questionImage),
    image: step.image ?? null,
    imageUrl: imageUrl(step.image),
    contentKey: step.contentKey ?? null,
    customizationKey: step.customizationKey ?? null,
    customizationKeyId: step.customizationKeyId ?? null,
    automationId: step.automationId ?? null,
    answers: (step.answerOptions ?? []).map((answer) => ({
      id: answer.id,
      order: answer.order,
      title: answer.title ?? null,
      description: answer.description ?? null,
      icon: answer.icon ?? null,
      iconUrl: imageUrl(answer.icon),
      isNoneAnswer: Boolean(answer.isNoneAnswer),
      contentValue: answer.contentValue ?? null,
      customizationValue: answer.customizationValue ?? null,
      customizationValueId: answer.customizationValueId ?? null,
      label: answer.label ?? null,
    })),
  };
}

function collectImageIds(value, ids = new Set()) {
  if (!value) return ids;
  if (Array.isArray(value)) {
    value.forEach((item) => collectImageIds(item, ids));
    return ids;
  }
  if (typeof value !== "object") return ids;

  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === "string" &&
      /(image|icon|logo)$/i.test(key) &&
      child &&
      !/^https?:\/\//i.test(child) &&
      !child.startsWith("/")
    ) {
      ids.add(child);
    }
    collectImageIds(child, ids);
  }

  return ids;
}

function toCsv(rows) {
  const headers = [
    "index",
    "type",
    "question_id",
    "title",
    "description",
    "question_type",
    "analytics_event",
    "content_key",
    "customization_key",
    "answer_count",
    "answers",
  ];

  const escape = (value) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const lines = rows.map((row) =>
    [
      row.index,
      row.type,
      row.questionId ?? "",
      row.title ?? "",
      row.description ?? "",
      row.questionType ?? "",
      row.analyticsEvent ?? "",
      row.contentKey ?? "",
      row.customizationKey ?? "",
      row.answers?.length ?? "",
      row.answers?.map((answer) => answer.title).filter(Boolean).join(" | ") ?? "",
    ]
      .map(escape)
      .join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}

async function main() {
  const [html, robots] = await Promise.all([
    getText(TARGET_URL),
    getText(`${ORIGIN}/robots.txt`).catch((error) => String(error)),
  ]);

  const nextData = extractNextData(html);
  const initialState = nextData.props.pageProps.initialState;
  const flow = initialState.flow.data;
  const firstPage = flow.firstPage;
  const quizSteps = (initialState.quiz.structure?.["0"] ?? []).map(pickQuestion);
  const scripts = unique(
    [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) =>
      absoluteUrl(match[1])
    )
  );
  const stylesheets = unique(
    [...html.matchAll(/<link[^>]+href="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((href) => href.endsWith(".css"))
      .map(absoluteUrl)
  );
  const externalUrls = unique(
    [...html.matchAll(/https?:\/\/[^"'<>\\\s]+/g)].map((match) => match[0])
  );
  const imageIds = unique([...collectImageIds({ flow, quizSteps })]).sort();

  const data = {
    scrapedAt: new Date().toISOString(),
    sourceUrl: TARGET_URL,
    robotsTxt: robots,
    next: {
      buildId: nextData.buildId,
      page: nextData.page,
      query: nextData.query,
    },
    flow: {
      id: flow.id,
      topic: flow.topic,
      planLabel: flow.planLabel,
      landingPagePath: flow.landingPagePath,
      salesFunnelId: flow.salesFunnelId,
      firstPageId: flow.firstPageId,
      useQuestionnaireAsFirstPage: flow.useQuestionnaireAsFirstPage,
      flowStyleType: flow.flowStyleType,
      featureTags: flow.featureTags,
      styles: flow.styles,
    },
    firstPage: {
      pageType: firstPage.pageType,
      pageId: firstPage.pageId,
      title: firstPage.title,
      subtitle: firstPage.subtitle,
      note: firstPage.note,
      browserTabTitle: firstPage.browserTabTitle,
      contentKey: firstPage.contentKey,
      automationId: firstPage.automationId,
      legalText: firstPage.legalText,
      customUrl: firstPage.customUrl,
      descriptionMetaTag: firstPage.descriptionMetaTag,
      analytics: firstPage.analytics,
      backgroundImage: firstPage.backgroundImage,
      cards: firstPage.cards.map((card) => ({
        ...card,
        imageUrl: imageUrl(card.image),
      })),
    },
    quiz: {
      stepIndex: initialState.quiz.stepIndex,
      genderId: initialState.quiz.genderId,
      initialized: initialState.quiz.initialized,
      predefinedAnswers: initialState.quiz.predefinedAnswers,
      predefinedStructure: initialState.quiz.predefinedStructure,
      structureGroups: initialState.quiz.structureGroups,
      steps: quizSteps,
    },
    resources: {
      scripts,
      stylesheets,
      externalUrls,
      imageIds,
      images: imageIds.map((id) => ({
        id,
        url960: imageUrl(id),
      })),
    },
    publicApiHostsObserved: unique(
      externalUrls
        .map((rawUrl) => {
          try {
            return new URL(rawUrl).origin;
          } catch {
            return null;
          }
        })
        .filter((origin) => origin && origin.includes("betterme"))
    ),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    `${OUT_DIR}/betterme_public_data.json`,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    `${OUT_DIR}/betterme_quiz_questions.csv`,
    `\uFEFF${toCsv(quizSteps)}\n`,
    "utf8"
  );
  await writeFile(
    `${OUT_DIR}/betterme_raw_next_data.json`,
    `${JSON.stringify(nextData, null, 2)}\n`,
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        outDir: OUT_DIR,
        flowId: flow.id,
        firstPageId: firstPage.pageId,
        quizStepCount: quizSteps.length,
        questionCount: quizSteps.filter((step) => step.type === "QUESTION")
          .length,
        nonQuestionStepCount: quizSteps.filter((step) => step.type !== "QUESTION")
          .length,
        imageIdCount: imageIds.length,
        scriptCount: scripts.length,
        stylesheetCount: stylesheets.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
