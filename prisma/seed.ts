import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { DocumentType, PriceMode, PrismaClient } from "../src/generated/prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const categories = ["Interior Paints","Exterior Paints","Luxury Finishes","Wood Coatings","Metal Coatings","Primers","Surface Preparation","Waterproofing","Textured Finishes","Roof Coatings"];
const productRows = [
  ["Aurora Royale Silk Emulsion","Luxury Finishes","Silk","Interior walls","luxury interior emulsion",125,"/placeholders/paint-bucket-luxury.svg"],
  ["Aurora Matt Interior Emulsion","Interior Paints","Matt","Interior walls and ceilings","premium matt emulsion",115,"/placeholders/paint-bucket-aurora.svg"],
  ["Aurora Stain Guard Luxury","Luxury Finishes","Soft sheen","High-traffic interior walls","washable stain-resistant emulsion",120,"/placeholders/paint-bucket-luxury.svg"],
  ["Aurora Weather Shield Exterior","Exterior Paints","Low sheen","Exterior masonry","weatherproof exterior emulsion",100,"/placeholders/paint-bucket-weather.svg"],
  ["Aurora Prime Seal","Primers","Matt","Plaster, masonry and concrete","water-based primer sealer",105,"/placeholders/paint-bucket-primer.svg"],
  ["Aurora Acrylic Wall Putty","Surface Preparation","Smooth","Interior and exterior walls","acrylic surface preparation",80,"/placeholders/paint-bucket-primer.svg"],
  ["Aurora Damp Block","Waterproofing","Protective","Damp and moisture-prone walls","waterproofing barrier coat",75,"/placeholders/paint-bucket-damp.svg"],
  ["Aurora Gloss Enamel","Metal Coatings","High gloss","Wood and metal","hard-wearing enamel",110,"/placeholders/paint-bucket-aurora.svg"],
  ["Aurora Wood Care Varnish","Wood Coatings","Natural gloss","Wooden doors and furniture","clear protective varnish",105,"/placeholders/paint-bucket-aurora.svg"],
  ["Aurora Texture Royale","Textured Finishes","Textured","Feature walls","decorative texture finish",55,"/placeholders/paint-bucket-luxury.svg"],
  ["Aurora Metal Guard","Metal Coatings","Satin","Metal gates, railings and structures","anti-corrosive metal coating",95,"/placeholders/paint-bucket-weather.svg"],
  ["Aurora Roof Cool Coat","Roof Coatings","Matt","Concrete roofs","heat-reflective roof coating",70,"/placeholders/paint-bucket-weather.svg"],
] as const;
const shadeRows = [
  ["Warm Ivory","#F4E8D2","Neutrals","warm","calm"],["Pearl White","#F8F5EE","Whites","neutral","clean"],["Sand Beige","#D8BE9A","Neutrals","warm","grounded"],["Chai Cream","#E7D1AF","Neutrals","warm","cozy"],
  ["Soft Almond","#D5C19E","Neutrals","warm","soft"],["Desert Clay","#C77D50","Orange","warm","earthy"],["Rose Petal","#E5B4B0","Pink","warm","gentle"],["Blush Pink","#EAC6C2","Pink","warm","playful"],
  ["Lavender Mist","#B6A5D2","Purple","cool","dreamy"],["Royal Plum","#5D406D","Purple","cool","dramatic"],["Sky Blue","#9EC7E4","Blue","cool","airy"],["Ocean Teal","#287B78","Blue","cool","refreshing"],
  ["Deep Navy","#203A5A","Blue","cool","confident"],["Mint Fresh","#B7D5BD","Green","cool","fresh"],["Olive Grove","#707D50","Green","warm","natural"],["Forest Green","#1E4D3A","Green","cool","restorative"],
  ["Sunshine Yellow","#F2C85B","Yellow","warm","energetic"],["Mustard Gold","#C7982C","Yellow","warm","rich"],["Terracotta","#B45D3E","Orange","warm","warm"],["Brick Red","#8D4134","Red","warm","bold"],
  ["Charcoal Grey","#404444","Grey","neutral","modern"],["Cloud Grey","#D5D8D5","Grey","cool","quiet"],["Warm Taupe","#A58F7C","Neutrals","warm","balanced"],["Cocoa Brown","#6A5041","Brown","warm","comforting"],
  ["Coffee Bean","#49362C","Brown","warm","deep"],["Fresh Peach","#F1B79F","Orange","warm","joyful"],["Pistachio","#C6D5A2","Green","warm","lighthearted"],["Dove Blue","#A7BED3","Blue","cool","serene"],
  ["Copper Dust","#B67456","Orange","warm","crafted"],["Golden Wheat","#D6AD5D","Yellow","warm","sunny"],["Porcelain","#EEE9DF","Whites","neutral","refined"],["Linen White","#E7DDCE","Whites","warm","quiet"],
  ["Rain Cloud","#929C9C","Grey","cool","composed"],["Slate Night","#46515A","Grey","cool","bold"],["Garden Sage","#AAB59B","Green","neutral","restful"],["Emerald Study","#366454","Green","cool","classic"],
  ["Powder Blue","#C2D5E3","Blue","cool","spacious"],["Indigo Ink","#3D4D74","Blue","cool","intelligent"],["Coral Bloom","#D98672","Red","warm","expressive"],["Burnished Gold","#A9772E","Yellow","warm","luxurious"],
] as const;
const roomImages = [
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&h=1000&q=85",
  "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1600&h=1000&q=85",
  "https://images.unsplash.com/photo-1697162103256-dad37889d979?auto=format&fit=crop&w=1600&h=1000&q=85",
  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1600&h=1000&q=85",
  "https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=1600&h=1000&q=85",
  "https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=1600&h=1000&q=85",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&h=1000&q=85",
  "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1600&h=1000&q=85",
];
const seasons = ["Spring","All season","Summer","Winter","Monsoon"];
const spaces = ["Living room","Bedroom","Kids room","Kitchen","Exterior","Office","Feature wall","Commercial"];
const roomNames = ["Elite Living","Master Bedroom","Kids Room","Executive Office","Kitchen Refresh","Bathroom Calm","Exterior Front","Compact Apartment Lounge"];
const roomSpaces = ["Living room","Bedroom","Kids room","Office","Kitchen","Bathroom","Exterior","Living room"];
const visualizerMasks = [
  [{id:"main-wall",name:"Main Wall",points:[[0,0],[430,0],[430,275],[250,275],[250,315],[0,315]],opacity:.56,blendMode:"multiply",source:"admin-manual"}],
  [{id:"main-wall",name:"Main Wall",points:[[0,0],[320,82],[320,395],[205,440],[205,555],[0,555]],opacity:.52,blendMode:"multiply",source:"admin-manual"}],
  [{id:"accent-wall",name:"Accent Wall",points:[[245,0],[337,0],[337,930],[245,930]],opacity:.5,blendMode:"multiply",source:"admin-manual"}],
  [{id:"main-wall",name:"Main Wall",points:[[975,300],[1070,300],[1070,390],[975,390]],opacity:.53,blendMode:"multiply",source:"admin-manual"}],
  [{id:"accent-wall",name:"Accent Wall",points:[[970,470],[1560,470],[1560,535],[970,535]],opacity:.48,blendMode:"multiply",source:"admin-manual"}],
  [{id:"main-wall",name:"Main Wall",points:[[235,100],[900,100],[900,565],[610,565],[610,610],[235,610]],opacity:.5,blendMode:"multiply",source:"admin-manual"}],
  [{id:"side-wall",name:"Side Wall",points:[[1325,475],[1425,505],[1425,755],[1360,780],[1325,740]],opacity:.5,blendMode:"multiply",source:"admin-manual"}],
  [{id:"main-wall",name:"Main Wall",points:[[180,0],[1390,0],[1390,300],[180,300]],opacity:.5,blendMode:"multiply",source:"admin-manual"}],
] as const;
const dealerRows = [
  ["Aurora Colour Studio","aurora-colour-studio","Lahore","Punjab","Gulberg","54660",31.5204,74.3587],
  ["Ahmed Paint House","ahmed-paint-house","Gujranwala","Punjab","GT Road","52250",32.1877,74.1945],
  ["City Paint Centre","city-paint-centre","Faisalabad","Punjab","D Ground","38000",31.4504,73.1350],
  ["Modern Paint Traders","modern-paint-traders","Islamabad","ICT","Blue Area","44000",33.7294,73.0931],
  ["Karachi Colour Depot","karachi-colour-depot","Karachi","Sindh","DHA","75500",24.8138,67.0305],
  ["Multan Finish Gallery","multan-finish-gallery","Multan","Punjab","Gulgasht","60000",30.1978,71.4697],
  ["Sialkot Paint Works","sialkot-paint-works","Sialkot","Punjab","Cantt","51310",32.4945,74.5229],
  ["Rawalpindi Colour Point","rawalpindi-colour-point","Rawalpindi","Punjab","Saddar","46000",33.5651,73.0169],
  ["Liberty Paint Gallery","liberty-paint-gallery","Lahore","Punjab","Model Town","54700",31.4813,74.3037],
  ["North Nazimabad Paints","north-nazimabad-paints","Karachi","Sindh","North Nazimabad","74700",24.9278,67.0344],
  ["Bahria Colour House","bahria-colour-house","Rawalpindi","Punjab","Bahria Town","46220",null,null],
  ["Peshawar Paint Link","peshawar-paint-link","Peshawar","Khyber Pakhtunkhwa","University Road","25120",null,null],
] as const;

const slug = (value: string) => value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const rgb = (hex: string) => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

async function main() {
  const admin = await prisma.user.upsert({ where: { email: "admin@paintos.local" }, update: {}, create: { name: "Paint OS Admin", email: "admin@paintos.local", passwordHash: await bcrypt.hash("Admin@12345", 12), role: "SUPER_ADMIN" } });
  const existing = await prisma.client.findUnique({ where: { slug: "aurora-paints" } });
  if (existing) await prisma.client.delete({ where: { id: existing.id } });
  const client = await prisma.client.create({
    data: {
      name:"Aurora Paints Pakistan",slug:"aurora-paints",tagline:"Colors that feel like home",description:"High-performance paint systems and expressive colour for Pakistani homes, climate, and craft.",
      primaryColor:"#173F32",secondaryColor:"#C9A45C",accentColor:"#A55337",backgroundColor:"#F3F0E9",surfaceColor:"#FAF8F3",textColor:"#17221D",mutedTextColor:"#68736D",
      headingFont:"Playfair Display",bodyFont:"Manrope",buttonStyle:"soft",cardStyle:"editorial",themePreset:"premium-home",tone:"premium but warm",
      whatsappNumber:"923001234567",phone:"042-111-000-777",email:"info@aurorapaints.pk",website:"https://aurorapaints.pk",address:"Gulberg III",city:"Lahore",state:"Punjab",country:"Pakistan",zipCode:"54660",
      facebookUrl:"https://facebook.com/aurorapaints",instagramUrl:"https://instagram.com/aurorapaints",youtubeUrl:"https://youtube.com/@aurorapaints",linkedinUrl:"https://linkedin.com/company/aurorapaints",
      featureFlag:{create:{visualizerEnabled:true,calculatorEnabled:true,productFinderEnabled:true,colorConsultantEnabled:true,problemSolverEnabled:true,dealerLocatorEnabled:true,painterBookingEnabled:true,ecommerceEnabled:false,quoteModeEnabled:true,blogEnabled:true,projectsEnabled:true,technicalLibraryEnabled:true,aiContentEnabled:true,shadeCardDigitizerEnabled:true,importEnabled:true}},
      socialLinks:{create:[{platform:"facebook",url:"https://facebook.com/aurorapaints",iconKey:"facebook"},{platform:"instagram",url:"https://instagram.com/aurorapaints",iconKey:"instagram"},{platform:"youtube",url:"https://youtube.com/@aurorapaints",iconKey:"youtube"},{platform:"linkedin",url:"https://linkedin.com/company/aurorapaints",iconKey:"linkedin"}]},
    },
  });

  const categoryMap = new Map<string,string>();
  for (const [i,name] of categories.entries()) {
    const category = await prisma.productCategory.create({data:{clientId:client.id,name,slug:slug(name),description:`Professional ${name.toLowerCase()} systems for lasting performance.`,imageUrl:roomImages[i%roomImages.length],iconKey:["PaintBucket","Home","Sparkles","Trees","Shield","Layers","Brush","Droplets","WandSparkles","Sun"][i],order:i}});
    categoryMap.set(name,category.id);
  }

  const createdProducts = [];
  for (const [i,row] of productRows.entries()) {
    const [name,category,finish,surface,type,coverage,bucketImageUrl]=row;
    const product = await prisma.product.create({data:{
      clientId:client.id,categoryId:categoryMap.get(category)!,name,slug:slug(name),sku:`AP-PROD-${String(i+1).padStart(3,"0")}`,
      subtitle:`A considered ${finish.toLowerCase()} finish with dependable protection.`,
      shortDescription:`${type[0].toUpperCase()+type.slice(1)} developed for ${surface.toLowerCase()}.`,
      longDescription:`${name} brings together refined colour, reliable coverage, and a professional finish. Its balanced formulation is designed around the demands of real homes and working surfaces.`,
      imageUrl:bucketImageUrl,bucketImageUrl,heroImageUrl:roomImages[i%roomImages.length],galleryJson:[roomImages[i%roomImages.length]],
      finish,sheenLevel:finish,surface,productType:type,spacesJson:spaces.slice(i%4,(i%4)+3),colorFamiliesJson:["Whites","Neutrals","Grey","Green","Blue"].slice(0,3+(i%3)),
      waterBased:![7,8,10].includes(i),oilBased:[7,8,10].includes(i),interiorExterior:category.includes("Exterior")||category.includes("Roof")?"exterior":"interior",
      coverageSqftPerLiterOneCoat:coverage,coverageSqftPerLiterTwoCoat:coverage/2,recommendedCoats:2,dryingTime:"2-4 hours",recoatTime:"4-6 hours",
      applicationToolsJson:["Brush","Roller","Airless spray"],packSizesJson:[1,4,10,16],featuresJson:["Low odor","Excellent coverage","Durable finish","Easy application"],
      benefitsJson:["Professional finish","Long-lasting colour","Made for local conditions"],recommendedSystemJson:["Prepare surface","Aurora Acrylic Wall Putty","Aurora Prime Seal",name,"Maintenance wash after full cure"],availableShadeIdsJson:[],
      warrantyYears:i===3?7:null,priceMode:PriceMode.quote,isFeatured:i<6,isNew:i===11,isBestSeller:[0,2,3].includes(i),
      seoTitle:`${name} | Aurora Paints`,seoDescription:`Explore ${name}, coverage, application, shades and technical details.`,
      productFeatures:{create:[
        {clientId:client.id,title:"Built to last",description:"A robust finish designed for everyday conditions.",iconKey:"ShieldCheck",order:1},
        {clientId:client.id,title:"Beautiful coverage",description:"Balanced flow and opacity for a refined result.",iconKey:"Layers",order:2},
        {clientId:client.id,title:"Easy care",description:"A dependable surface that is simpler to maintain.",iconKey:"Sparkles",order:3},
      ]},
      applicationSteps:{create:[
        {clientId:client.id,stepNumber:1,title:"Prepare",productName:"Surface preparation",coats:1,tool:"Scraper and sandpaper",description:"Clean, dry, repair and level the surface.",iconKey:"Wrench",order:1},
        {clientId:client.id,stepNumber:2,title:"Prime",productName:"Aurora Prime Seal",coats:1,tool:"Roller",description:"Seal the surface for adhesion and even coverage.",iconKey:"Layers",order:2},
        {clientId:client.id,stepNumber:3,title:"Finish",productName:name,coats:2,tool:"Roller or brush",description:"Apply two even coats and respect recoat time.",iconKey:"Paintbrush",order:3},
      ]},
      faqs:{create:[
        {clientId:client.id,question:`Where can I use ${name}?`,answer:`Use it on properly prepared ${surface.toLowerCase()}.`,order:1},
        {clientId:client.id,question:"How many coats are recommended?",answer:"Two finish coats over the recommended preparation system.",order:2},
      ]},
    }});
    createdProducts.push(product);
  }

  const createdShades=[];
  for (const [i,[name,hex,family,temp,mood]] of shadeRows.entries()) createdShades.push(await prisma.shade.create({data:{
    clientId:client.id,name,slug:slug(name),code:`AP-${String(i+1).padStart(3,"0")}`,hex,rgb:rgb(hex),colorFamily:family,temperature:temp,mood,
    lightness:i%4===0?"dark":i%3===0?"medium":"light",season:seasons[i%seasons.length],spacesJson:spaces.slice(i%5,(i%5)+3),bestRoomsJson:["Living Room","Bedroom"],matchingShadeIdsJson:[],
    collection:i<10?"Essential Neutrals":"Aurora Living",finishAvailabilityJson:["Matt","Silk"],productIdsJson:createdProducts.slice(0,6).map(p=>p.id),
    description:`${name} is a ${mood} ${family.toLowerCase()} created for layered, liveable interiors.`,isTrending:i<14,isColorOfYear:i===15,
  }}));

  for (const [i,name] of roomNames.entries()) {
    const space=roomSpaces[i];
    const room=await prisma.room.create({data:{clientId:client.id,name,slug:slug(name),description:`An editorial ${space.toLowerCase()} direction pairing performance with considered colour.`,imageUrl:roomImages[i%roomImages.length],roomType:space,space,dominantColorFamily:createdShades[i].colorFamily,recommendedShadeIdsJson:createdShades.slice(i,i+4).map(s=>s.id),recommendedProductIdsJson:createdProducts.slice(i%4,(i%4)+3).map(p=>p.id),designTips:"Layer one grounding shade with a lighter architectural neutral, then choose the finish around traffic and light.",order:i}});
    await prisma.visualizerSpace.create({data:{clientId:client.id,name,slug:`${slug(name)}-studio`,roomType:space,space,imageUrl:room.imageUrl,thumbnailUrl:room.imageUrl,maskJson:{version:2,status:"approved",imageWidth:1600,imageHeight:1000,layers:visualizerMasks[i].map(mask=>({...mask,type:"wall",source:"gallery-approved",originalImageWidth:1600,originalImageHeight:1000,needsReview:false,locked:true,visible:true})),masks:visualizerMasks[i]},maskStatus:"approved",maskUpdatedAt:new Date(),maskUpdatedBy:admin.id,defaultShadeId:createdShades[i].id,isFeatured:i<4}});
  }

  for (const [i,[name,dealerSlug,city,state,area,zipCode,lat,lng]] of dealerRows.entries()) await prisma.dealer.create({data:{clientId:client.id,name,slug:dealerSlug,city,state,area,zipCode,address:`${area}, ${city}`,phone:`0300-11122${i}3`,whatsapp:`9230011122${i}3`,latitude:lat,longitude:lng,managerName:["Saad","Adeel","Naveed","Hassan","Kamran","Bilal","Usman","Faisal","Zain","Tariq","Owais","Hamid"][i],availableProductCategoryIdsJson:[...categoryMap.values()],openingHours:"Mon-Sat 9:00 AM-7:00 PM",isFeatured:i<4}});
  for (const [i,title] of ["Complete Shade Card","Product Catalogue","Royale Silk TDS","Weather Shield TDS","Prime Seal TDS","Damp Block Guide","Metal Guard TDS","Roof Cool Coat Guide"].entries()) await prisma.document.create({data:{clientId:client.id,title:`Aurora ${title}`,type:i===0?DocumentType.shade_card:i===1?DocumentType.brochure:i===5||i===7?DocumentType.application_guide:DocumentType.tds,fileUrl:"#",productId:i>1?createdProducts[Math.min(i-2,createdProducts.length-1)].id:null,description:"Technical information, preparation, application and performance guidance."}});
  for (const [i,[question,answer]] of [
    ["How do I choose the right paint?","Start with the surface, room conditions, desired finish, and preparation needs. The Product Finder maps those details to real Aurora systems."],
    ["Are digital shade colours exact?","Screens are only a guide. Always approve a physical shade sample in the intended room, light, and finish."],
    ["Can I visualize more than one wall colour?","Yes. The visualizer stores independent shade and finish settings for every approved wall mask."],
    ["What should I do before repainting a damp wall?","Find and stop the moisture source, allow the substrate to dry, remove unstable material, and use the recommended preparation system before topcoat."],
    ["How is paint quantity estimated?","The calculator uses paintable area, coats, product coverage, deductions, and a practical wastage allowance."],
  ].entries()) await prisma.fAQ.create({data:{clientId:client.id,question,answer,order:i+1,isActive:true}});
  for (const [i,title] of ["Best Colours for Pakistani Living Rooms","Choosing Exterior Paint for Rain and Sun","Matt or Silk: A Considered Guide","Why Primer Changes the Final Finish","Treating Damp Walls Before Painting","A Quiet Approach to Modern Colour","How to Build a Complete Paint System","The 2026 Aurora Colour Edit"].entries()) await prisma.blogPost.create({data:{clientId:client.id,title,slug:slug(title),excerpt:"Practical, design-led guidance for better colour and longer-lasting finishes.",content:"A thoughtful paint project begins with the surface, the light, and the way a room is lived in. Test colours in real conditions and use the complete recommended system.",imageUrl:roomImages[i%roomImages.length],category:"Colour & Advice",tagsJson:["colour","home"],seoTitle:title,seoDescription:"Aurora Paints expert guide.",isPublished:true,publishedAt:new Date()}});
  for (const [i,[name,city,quote]] of [["Ayesha Rahman","Lahore","The finish feels considered and the wall still cleans beautifully."],["Hamza Khan","Murree","Our exterior carried through the rainy season with confidence."],["Mariam Siddiqui","Islamabad","The studio helped us build a calm, complete palette."],["Ali Hassan","Faisalabad","Coverage was excellent and the result felt genuinely premium."],["Sana Farooq","Karachi","The dealer made a difficult colour decision feel simple."],["Usman Ahmed","Gujranwala","Using the full system made a visible difference."]].entries()) await prisma.testimonial.create({data:{clientId:client.id,name,city,rating:5,quote,productId:createdProducts[i%createdProducts.length].id,isFeatured:i<3}});
  for (const [i,title] of ["Modern Lahore Residence","Murree Weatherproof Exterior","Faisalabad Family Living Room","Islamabad Office Colour Refresh"].entries()) await prisma.project.create({data:{clientId:client.id,title,slug:slug(title),description:"A complete Aurora colour and performance transformation.",city:["Lahore","Murree","Faisalabad","Islamabad"][i],projectType:i===1?"Exterior":"Interior",beforeImageUrl:roomImages[(i+3)%roomImages.length],afterImageUrl:roomImages[i],galleryJson:[roomImages[i]],productIdsJson:[createdProducts[i].id],shadeIdsJson:[createdShades[i].id],clientName:"Private client",completionDate:new Date(),isFeatured:true}});
  await prisma.homepageSection.createMany({data:[
    {clientId:client.id,key:"hero",sectionType:"hero",eyebrow:"Colour, considered",title:"Colors that feel like home",subtitle:"High-performance paint systems and expressive colour for Pakistani homes.",ctaLabel:"Find my paint",ctaUrl:"product-finder",secondaryCtaLabel:"Explore colours",secondaryCtaUrl:"colors",order:1,backgroundImageUrl:roomImages[0]},
    {clientId:client.id,key:"ai-wizards",sectionType:"feature",eyebrow:"AI guidance",title:"Choose with a smarter paint journey",subtitle:"Product, palette, seepage, budget and shade-match wizards grounded in the catalogue.",ctaLabel:"Open AI wizards",ctaUrl:"ai-wizards",order:2},
    {clientId:client.id,key:"final-cta",sectionType:"cta",eyebrow:"Begin with confidence",title:"Build a paint plan around your space.",subtitle:"Colour, quantity, system, dealer, and expert advice in one clear journey.",ctaLabel:"Start product finder",ctaUrl:"product-finder",order:24},
  ]});
  console.log(`Seeded ${client.name}: ${createdProducts.length} products, ${createdShades.length} shades, ${dealerRows.length} dealers.`);
}

main().finally(async()=>prisma.$disconnect());
