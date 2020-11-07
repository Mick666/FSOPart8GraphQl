const { ApolloServer, gql, UserInputError, AuthenticationError } = require('apollo-server')
const { PubSub } = require('apollo-server')
const pubsub = new PubSub()
const { v1: uuid } = require('uuid')
const mongoose = require('mongoose')
const Book = require('./models/book')
const Author = require('./models/author')
const User = require('./models/user')

const jwt = require('jsonwebtoken')
const JWT_SECRET = 'NEED_HERE_A_SECRET_KEY'

MONGODB_URI = 'mongodb+srv://fullstack:UNuxm8GuMTCg5zG@cluster0.lvynx.mongodb.net/graphql?retryWrites=true'

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })
    .then(() => {
        console.log('connected to MongoDB')
    })
    .catch((error) => {
        console.log('error connection to MongoDB:', error.message)
    })

const typeDefs = gql`
type Book {
  title: String!
  published: Int!
  author: Author!
  genres: [String!]!
  id: ID!
}

type Author {
    name: String!
    id: ID!
    born: Int
    bookCount: Int
}

type User {
    username: String!
    favouriteGenre: String!
    id: ID!
}
  
type Token {
    value: String!
}

type Query {
      bookCount: Int!
      authorCount: Int!
      allBooks(author: String, genre: String): [Book!]!
      allAuthors: [Author!]!
      me: User
  }
type Mutation {
    addBook(
        title: String!
        author: String!
        published: String!
        genres: [String!]!
    ): Book
    addAuthor(
        name: String!
        born: Int
    ) : Author
    editAuthor(
        name: String!
        setBornTo: String!
    ): Author
    createUser(
        username: String!
        favouriteGenre: String!
    ): User
    login(
        username: String!
        password: String!
    ): Token
}
type Subscription {
    bookAdded: Book!
}
`

const countAuthors = (books) => {
    let authors = {}

    books.forEach(b => {
        if (authors[b.author]) authors[b.author]++
        else authors[b.author] = 1
    })

    return authors
}

const resolvers = {
    Query: {
        bookCount: () => Book.collection.countDocuments(),
        authorCount: () => Author.collection.countDocuments(),
        allBooks: async (root, args) => {
            const bookSearch = await Book.find({}).populate('author')
            if (!args.author && !args.genre) return await Book.find({}).populate('author')
            else if (!args.author) {
                return await Book.find({ genres: args.genre }).populate('author')
            }
            //  else if (!args.genre) {
            //     return books.filter(book => book.author === args.author)
            // } else {
            //     return books.filter(book => book.author === args.author && book.genres.includes(args.genre))
            // }
        },
        allAuthors: async () => {
            const authors = await Author.find({})
            const books = await Book.find({})
            const bookCount = countAuthors(books)

            return authors.map(a => {
                let author = { ...a.toObject(), bookCount: bookCount[a._id] ? bookCount[a._id] : 0}
                return author
            })
        },
        me: (root, args, context) => {
            return context.currentUser
        }
    },
    Mutation: {
        addBook: async (root, args, context) => {
            let authorArg 
            if (mongoose.isValidObjectId(args.author)) {
                authorArg = args.author
            } else {
                const authorSearch = await Author.find({ name: args.author })
                if (authorSearch.length > 0) {
                    authorArg = authorSearch[0]._id
                } else {
                    const newAuthor = new Author({ name: args.author })
                    await newAuthor.save()
                    authorArg = newAuthor._id
                }
            }

            const book = new Book({ ...args, author: authorArg._id ? authorArg._id : authorArg})

            const currentUser = context.currentUser

            if (!currentUser) {
              throw new AuthenticationError("not authenticated")
            }

            try {
                await book.save()
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args,
                })
            }
            const savedBook = await Book.findById(book._id).populate('author')
            console.log(savedBook)
            
            pubsub.publish('BOOK_ADDED', { bookAdded: savedBook })

            return savedBook
        },
        addAuthor: async (root, args) => {
            const author = new Author({ ...args })

            try {
                await author.save()
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args,
                })
            }
            return author
        },
        editAuthor: async (root, args, context) => {
            const currentUser = context.currentUser

            if (!currentUser) {
              throw new AuthenticationError("not authenticated")
            }
            
            const author = await Author.findOne({ name: args.name })
            author.born = args.setBornTo

            try {
                await author.save()
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args,
                })
            }

            return author
        },
        createUser: async (root, args) => {
            const user = new User({ ...args })

            return user.save()
            .catch(error => {
              throw new UserInputError(error.message, {
                invalidArgs: args,
              })
            })
        },
        login: async (root, args) => {
            const user = await User.findOne({ username: args.username })
        
            if ( !user || args.password !== 'secred' ) {
              throw new UserInputError("wrong credentials")
            }
        
            const userForToken = {
              username: user.username,
              id: user._id,
            }
        
            return { value: jwt.sign(userForToken, JWT_SECRET) }
        },
    }, Subscription: {
        bookAdded: {
            subscribe: () => pubsub.asyncIterator(['BOOK_ADDED'])
        }
    }
}

const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
        const auth = req ? req.headers.authorization : null
        if (auth && auth.toLowerCase().startsWith('bearer ')) {
          const decodedToken = jwt.verify(
            auth.substring(7), JWT_SECRET
          )
    
          const currentUser = await User
            .findById(decodedToken.id)
    
          return { currentUser }
        }
    }
})

server.listen().then(({ url, subscriptionsUrl }) => {
    console.log(`Server ready at ${url}`)
    console.log(`Subscriptions ready at ${subscriptionsUrl}`)
})