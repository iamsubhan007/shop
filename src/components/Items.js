let items = [
    {
      id: "1",
      title: "Nutella Naan",
      description: "Rs. 500 - Freshly Baked.",
      pic: "/Nutella.jpg",
      genre: "Special"
    },
    {
      id: "2",
      title: "Tandoori Pizza",
      description: "Rs. 500 -Freshly Baked.",
      pic: "/pizza_naan.jpg",
      genre: "Special"
    },
    {
      id: "3",
      title: "Tandoori Shawarma",
      description: "Rs. 400 - Freshly Baked.",
      pic: "/shawarma.jpg",
      genre: "Special"
    },
    {
      id: "4",
      title: "Cheese Naan",
      description: "Rs. 400 - Freshly Baked.",
      pic: "/cheese.jpg",
      genre: "Special"
    },
    {
      id: "5",
      title: "Mutton Naan",
      description: "Freshly Baked.",
      pic: "/beef paratha naan .jpg",
      genre: "Mutton",
      toggleItems: [
        { label: "Special Mutton Achaari Naan - Rs. 850", link: "/Menu" },
        { label: "Special Mutton Qeema Naan - Rs. 800", link: "/Menu" },
        { label: "Special Mutton Cheese Makhan Rogni Naan - Rs. 1170", link: "/Menu" },
        { label: "Special Mutton Achaari Makhan Rogni Naan - Rs. 1020", link: "/Menu" },
        { label: "Special Mutton Makhan Rogni Naan - Rs. 970", link: "/Menu" },
        { label: "Special Mutton Cheese Rogni Naan - Rs. 1070", link: "/Menu" },
        { label: "Special Mutton Achaari Rogni Naan - Rs. 920", link: "/Menu" },
        { label: "Special Mutton Rogni Naan - Rs. 870", link: "/Menu" },
        { label: "Special Mutton Cheese Makhan Naan - Rs. 1100", link: "/Menu" },
        { label: "Special Mutton Achaari Makhan Rogni Naan - Rs. 950", link: "/Menu" },
        { label: "Special Mutton Makhan Rogni Naan - Rs. 900", link: "/Menu" },
        { label: "Special Mutton Cheese Naan - Rs. 1000", link: "/Menu" }
      ]
    },
    {
          id: "6",
          title: "Chicken Naan",
          description: "Freshly Baked.",
          pic: "/chicken naan.jpg",
          genre: "Chicken",
          toggleItems: [
            { label: "Special Chicken Cheese Makhan Rogni Naan - Rs. 670", link: "/Menu" },
            { label: "Special Chicken Achaari Makhan Rogni Naan - Rs. 620", link: "/Menu" },
            { label: "Special Chicken Makhan Rogni Naan - Rs. 570", link: "/Menu" },
            { label: "Chicken Cheese Makhan Rogni Naan - Rs. 540", link: "/Menu" },
            { label: "Chicken Achaari Makhan Rogni Naan - Rs. 470", link: "/Menu" },
            { label: "Chicken Makhan Rogni Naan - Rs. 420", link: "/Menu" },
            { label: "Special Chicken Cheese Rogni Naan - Rs. 570", link: "/Menu" },
            { label: "Special Chicken Achaari Rogni Naan - Rs. 420", link: "/Menu" },
            { label: "Special Chicken Rogni Naan - Rs. 470", link: "/Menu" },
            { label: "Chicken Cheese Rogni Naan - Rs. 440", link: "/Menu" },
            { label: "Chicken Achaari Rogni Naan - Rs. 370", link: "/Menu" },
            { label: "Chicken Rogni Naan - Rs. 320", link: "/Menu" },
            { label: "Special Chicken Cheese Makhan Naan - Rs. 600", link: "/Menu" },
            { label: "Special Chicken Achaari Makhan Naan - Rs. 550", link: "/Menu" },
            { label: "Special Chicken Makhan Naan - Rs. 500", link: "/Menu" },
            { label: "Chicken Cheese Makhan Naan - Rs. 470", link: "/Menu" },
            { label: "Chicken Achaari Makhan Naan - Rs. 400", link: "/Menu" },
            { label: "Chicken Makhan Naan - Rs. 350", link: "/Menu" },
            { label: "Special Chicken Cheese Naan - Rs. 500", link: "/Menu" },
            { label: "Special Chicken Achaari Naan - Rs. 450", link: "/Menu" },
            { label: "Special Chicken Qeema Naan - Rs. 400", link: "/Menu" },
            { label: "Chicken Cheese Naan - Rs. 370", link: "/Menu" },
            { label: "Chicken Achaari Naan - Rs. 300", link: "/Menu" },
            { label: "Chicken Qeema Naan - Rs. 250", link: "/Menu" }
          ]
        },
        {
            id: "8",
            title: "Beef Naan",
            description: "Freshly Baked.",
            pic: "/beef2.jpg",
            genre: "Beef",
            toggleItems: [
            { label: "Special Beef Cheese Makhan Rogni Naan - Rs. 670", link: "/Menu" },
            { label: "Special Beef Achaari Makhan Rogni Naan - Rs. 620", link: "/Menu" },
            { label: "Special Beef Makhan Rogni Naan - Rs. 570", link: "/Menu" },
            { label: "Beef Cheese Makhan Rogni Naan - Rs. 540", link: "/Menu" },
            { label: "Beef Achaari Makhan Rogni Naan - Rs. 470", link: "/Menu" },
            { label: "Beef Makhan Rogni Naan - Rs. 420", link: "/Menu" },
            { label: "Special Beef Cheese Rogni Naan - Rs. 570", link: "/Menu" },
            { label: "Special Beef Achaari Rogni Naan - Rs. 420", link: "/Menu" },
            { label: "Special Beef Rogni Naan - Rs. 470", link: "/Menu" },
            { label: "Beef Cheese Rogni Naan - Rs. 440", link: "/Menu" },
            { label: "Beef Achaari Rogni Naan - Rs. 370", link: "/Menu" },
            { label: "Beef Rogni Naan - Rs. 320", link: "/Menu" },
            { label: "Special Beef Cheese Makhan Naan - Rs. 600", link: "/Menu" },
            { label: "Special Beef Achaari Makhan Naan - Rs. 550", link: "/Menu" },
            { label: "Special Beef Makhan Naan - Rs. 500", link: "/Menu" },
            { label: "Beef Cheese Makhan Naan - Rs. 470", link: "/Menu" },
            { label: "Beef Achaari Makhan Naan - Rs. 400", link: "/Menu" },
            { label: "Beef Makhan Naan - Rs. 350", link: "/Menu" },
            { label: "Special Beef Cheese Naan - Rs. 500", link: "/Menu" },
            { label: "Special Beef Achaari Naan - Rs. 450", link: "/Menu" },
            { label: "Special Beef Qeema Naan - Rs. 400", link: "/Menu" },
            { label: "Beef Cheese Naan - Rs. 370", link: "/Menu" },
            { label: "Beef Achaari Naan - Rs. 300", link: "/Menu" },
            { label: "Beef Qeema Naan - Rs. 250", link: "/Menu" }]
    },
    {
          id: "9",
          title: "Rogni Naan",
          description: "Freshly Baked.",
          pic: "/Rogni.jpg",
          genre: "Rogni",
          toggleItems: [
            { label: "Special Milky Makhan Rogni Naan - Rs. 160", link: "/Menu" },
            { label: "Special Kalwangi Rogni Naan - Rs. 120", link: "/Menu" },
            { label: "Special Zeree Wala Rogni Naan - Rs. 120", link: "/Menu" },
            { label: "Special Till Wala Rogni Naan - Rs. 120", link: "/Menu" },
            { label: "Special Garlic Makhan Rogni Naan - Rs. 180", link: "/Menu" },
            { label: "Special Kalwangi Makhan Rogni Naan - Rs. 180", link: "/Menu" },
            { label: "Special Zeree Wala Rogni Naan - Rs. 120", link: "/Menu" },
            { label: "Special Till Wala Rogni Naan - Rs. 120", link: "/Menu" },
            { label: "Special Garlic Rogni Naan - Rs. 120", link: "/Menu" },
            { label: "Special Milky Rogni Naan - Rs. 100", link: "/Menu" },
            { label: "Half Rogni Naan - Rs. 60", link: "/Menu" }
          ]
        },
        {
          id: "10",
          title: "Aloo Wala Naan",
          description: "Freshly Baked.",
          pic: "/alooo nan.jpg",
          genre: "Aloo",
          toggleItems: [
            { label: "Special Aloo Wala Naan - Rs. 150", link: "/Menu" },
            { label: "Aloo Wala Naan - Rs. 100", link: "/Menu" },
            { label: "Special Aloo Makhan Cheese Naan - Rs. 300", link: "/Menu" },
            { label: "Special Aloo Makhan Achaari Naan - Rs. 220", link: "/Menu" },
            { label: "Special Aloo Makhan Naan - Rs. 200", link: "/Menu" },
            { label: "Special Aloo Cheese Naan - Rs. 250", link: "/Menu" },
            { label: "Special Aloo Achaari Naan - Rs. 180", link: "/Menu" }
          ]
        },
        {
          id: "11",
          title: "Besaan Wala Naan",
          description: "Freshly Baked.",
          pic: "/baisan naan .png",
          genre: "Besaan",
          toggleItems: [
            { label: "Besaan Wala Naan - Rs. 100", link: "/Menu" },
            { label: "Besaan Achaari Naan - Rs. 150", link: "/Menu" },
            { label: "Special Besaan Makhan Naan - Rs. 200", link: "/Menu" }
          ]
        },
        {
          id: "12",
          title: "Tikka Boti Naan",
          description: "Boti wrapped in naan.",
          pic: "/shawarma.jpg",
          genre: "Tikka Boti",
          toggleItems: [
            { label: "Special Chicken Makhan Tikka Boti Naan - Rs. 550", link: "/Menu" },
            { label: "Chicken Makhan Tikka Boti Naan - Rs. 400", link: "/Menu" },
            { label: "Special Chicken Boti Tikka Naan - Rs. 450", link: "/Menu" },
            { label: "Chicken Tikka Boti Naan - Rs. 300", link: "/Menu" }
          ]
        },
        {
          id: "13",
          title: "Kabab Rolls",
          description: "Delicious rolls.",
          pic: "/shawarma.jpg",
          genre: "Kabab Roll",
          toggleItems: [
            { label: "Chicken Cheese Kabab Roll - Rs. 200", link: "/Menu" },
            { label: "Chicken Kabab Roll - Rs. 120", link: "/Menu" }
          ]
        },
        {
          id: "14",
          title: "Pratha",
          description: "Served hot.",
          pic: "/pratha.jpg",
          genre: "Pratha",
          toggleItems: [
            { label: "Special Makhan Pratha - Rs. 160", link: "/Menu" },
            { label: "Special Achari Pratha - Rs. 150", link: "/Menu" },
            { label: "Special Meetha Pratha - Rs. 150", link: "/Menu" },
            { label: "Special Pratha - Rs. 100", link: "/Menu" }
          ]
        },
        {
          id: "15",
          title: "Regular Items",
          description: "Daily naan options.",
          pic: "/rogni garlic naan.jpg",
          genre: "Regular",
          toggleItems: [
            { label: "Prathe - Rs. 100", link: "/Menu" },
            { label: "Special Kulcha - Rs. 50", link: "/Menu" },
            { label: "Kulcha - Rs. 30", link: "/Menu" },
            { label: "Special Sada Naan - Rs. 45", link: "/Menu" },
            { label: "Sada Naan - Rs. 25", link: "/Menu" },
            { label: "Khamiri Roti - Rs. 25", link: "/Menu" }
          ]
        },
        {
          id: "16",
          title: "Side",
          description: "Add-on for your meal.",
          pic: "/pizza_naan.jpg",
          genre: "Side",
          toggleItems: [
            { label: "Raita - Rs. 50", link: "/Menu" }
          ]
        }
];
export {items};
  