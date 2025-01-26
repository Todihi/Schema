const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const app = express();
const port = process.env.PORT || 4000;

// Set up storage for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Temporary storage folder
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Temporarily save with a timestamped name
  },
});

const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Serve files from the uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Handle PDF upload and text-based renaming
app.post(
  "/upload",
  upload.fields([{ name: "fileEven" }, { name: "fileOdd" }]),
  (req, res) => {
    const files = req.files;
    if (!files || !files.fileEven || !files.fileOdd) {
      return res.status(400).send("Two files must be uploaded.");
    }

    const processFile = (file, weekType) => {
      const tempFilePath = path.join(__dirname, "uploads", file[0].filename);

      return new Promise((resolve, reject) => {
        fs.readFile(tempFilePath, (err, data) => {
          if (err) {
            console.error("Error reading file:", err);
            return reject("Error reading the file.");
          }

          pdfParse(data)
            .then((result) => {
              const fileText = result.text;

              // Check if "Klass" is present in the text
              if (!fileText.includes("Klass")) {
                // Delete the temporary file
                fs.unlink(tempFilePath, (err) => {
                  if (err) {
                    console.error("Error deleting file:", err);
                  }
                });
                return reject("Den uppladdade filen är inte ett schema.");
              }

              // Match text (letters and spaces, no numbers) before "Klass:"
              const beforeKlassMatch = fileText.match(/([a-zA-Z\s]+)\s*Klass:/);

              // Match 5 characters (letters or numbers) after "Klass:"
              const afterKlassMatch = fileText.match(
                /Klass:\s*([a-zA-Z0-9]{5})/
              );

              let newFileName;
              if (beforeKlassMatch && beforeKlassMatch[1].trim() !== "") {
                // Use the text before "Klass:" as the file name, trimming extra spaces
                newFileName = beforeKlassMatch[1].trim();
              } else if (afterKlassMatch) {
                // Fallback: Use 5 characters after "Klass:"
                newFileName = afterKlassMatch[1];
              } else {
                // Default fallback name
                newFileName = "defaultName";
              }

              // Sanitize the file name
              const sanitizedFileName = newFileName
                .replace(/[^a-zA-Z0-9\s]/g, "") // Allow letters, numbers, and spaces
                .replace(/\s+/g, "_") // Replace spaces with underscores
                .toLowerCase();

              const finalFilePath = path.join(
                __dirname,
                "uploads",
                `${sanitizedFileName}_${weekType}.pdf`
              );

              fs.rename(tempFilePath, finalFilePath, (err) => {
                if (err) {
                  console.error("Error renaming file:", err);
                  return reject("Error renaming the file.");
                }
                resolve(`${weekType} laddades upp!`);
              });
            })
            .catch((error) => {
              console.error("Error parsing PDF:", error);
              reject("Failed to extract text.");
            });
        });
      });
    };

    Promise.all([
      processFile(files.fileEven, "even"),
      processFile(files.fileOdd, "odd"),
    ])
      .then((messages) => {
        res.send(messages.join(" "));
      })
      .catch((error) => {
        res.status(400).send(error);
      });
  }
);

// Endpoint to check if a file exists and render both even and odd PDFs
app.get("/file/:name", (req, res) => {
  let fileName = req.params.name.toLowerCase().replace(/\s+/g, "_");
  const evenFilePath = path.join(__dirname, "uploads", `${fileName}_even.pdf`);
  const oddFilePath = path.join(__dirname, "uploads", `${fileName}_odd.pdf`);

  const filesToSend = [];

  if (fs.existsSync(evenFilePath)) {
    filesToSend.push(evenFilePath);
  }
  if (fs.existsSync(oddFilePath)) {
    filesToSend.push(oddFilePath);
  }

  if (filesToSend.length === 0) {
    return res.status(404).send("Files not found.");
  }

  res.send(
    filesToSend.map((filePath) => `/uploads/${path.basename(filePath)}`)
  );
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
